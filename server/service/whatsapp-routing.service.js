'use strict';
const meta = require('../integrations/meta/meta.client');
const wazo = require('../integrations/wazo/whatsapp-team.adapter');

// Tickets are Prisma cuid values. Employees interact with the business number.
function parseCommand(value) {
  const match = /^\s*(CLAIM|REPLY|CLOSE)\s+([a-z0-9]{10,40})(?:\s+([\s\S]*))?\s*$/i.exec(value || '');
  return match ? { action: match[1].toUpperCase(), ticket: match[2], body: (match[3] || '').trim() } : null;
}

async function customerSend(channel, conversation, text) {
  if (!conversation.customerWindowUntil || conversation.customerWindowUntil <= new Date()) {
    throw new Error('Customer service window expired; approved outbound template required');
  }
  return meta.sendText(channel, conversation.customerPhone, text);
}

async function notifyMembers(prisma, channel, conversation, incoming) {
  const members = await prisma.waMember.findMany({ where: {
    channelId: channel.id, enabled: true, optedIn: true,
    ...(conversation.assignedWazoUserId != null
      ? { wazoUserId: conversation.assignedWazoUserId }
      : { departmentCode: conversation.departmentCode }),
  }});
  const organization = await prisma.organization.findUnique({ where: { id: channel.organizationId } });
  const department = conversation.departmentCode != null
    ? await prisma.waDepartment.findUnique({ where: { channelId_code: {
      channelId: channel.id, code: conversation.departmentCode,
    }}})
    : null;
  if (conversation.departmentCode != null && !department?.enabled) {
    throw new Error('Selected department is no longer active');
  }
  if (!members.length) {
    console.warn('[WhatsApp] No eligible recipients for ticket', conversation.id,
      'department', conversation.departmentCode || 'all');
    return;
  }
  for (const member of members) {
    await wazo.validateMember(organization, member.wazoUserId,
      department?.externalDepartmentId ?? null);
    const notification = await prisma.waNotification.upsert({
      where: { inboundId_memberId: { inboundId: incoming.id, memberId: member.id } },
      create: { inboundId: incoming.id, memberId: member.id }, update: {},
    });
    if (notification.status === 'SUBMITTED') continue;
    try {
      // Must match a Meta-approved template with exactly two body parameters.
      const excerpt = (incoming.messageText || '[Non-text message]').slice(0, 400);
      const providerId = await meta.sendTemplate(channel, member.phone,
        process.env.WA_EMPLOYEE_TEMPLATE || 'ivr_team_inquiry', [conversation.id, excerpt]);
      await prisma.waNotification.update({ where: { id: notification.id }, data: {
        status: 'SUBMITTED', providerId, error: null,
      }});
      console.log('[WhatsApp] Team notification submitted', {
        ticket: conversation.id, memberId: member.id, providerId,
      });
    } catch (error) {
      await prisma.waNotification.update({ where: { id: notification.id }, data: {
        status: 'FAILED', error: String(error.message).slice(0, 500),
      }});
      throw error;
    }
  }
}

async function handleStaff(prisma, channel, inbound, members) {
  const command = parseCommand(inbound.messageText);
  if (!command) {
    await meta.sendText(channel, inbound.senderPhone,
      'Use CLAIM <ticket>, REPLY <ticket> <message>, or CLOSE <ticket>.');
    return;
  }
  const conversation = await prisma.waConversation.findFirst({ where: {
    id: command.ticket, channelId: channel.id,
  }});
  if (!conversation || conversation.status !== 'OPEN') {
    await meta.sendText(channel, inbound.senderPhone, 'Ticket not found or not open.');
    return;
  }
  if (members.length !== 1) throw new Error('Ambiguous WhatsApp employee phone');
  const member = members[0];
  if (!member.optedIn || member.departmentCode !== conversation.departmentCode) {
    await meta.sendText(channel, inbound.senderPhone, 'Not authorized for this department.');
    return;
  }
  const organization = await prisma.organization.findUnique({ where: { id: channel.organizationId } });
  const department = member.departmentCode == null ? null : await prisma.waDepartment.findUnique({
    where: { channelId_code: { channelId: channel.id, code: member.departmentCode } },
  });
  if (member.departmentCode != null && !department?.enabled) return;
  await wazo.validateMember(organization, member.wazoUserId,
    department?.externalDepartmentId ?? null);

  if (command.action === 'CLAIM') {
    const result = await prisma.waConversation.updateMany({ where: {
      id: conversation.id, status: 'OPEN', assignedWazoUserId: null,
    }, data: { assignedWazoUserId: member.wazoUserId }});
    const alreadyMine = conversation.assignedWazoUserId === member.wazoUserId;
    await meta.sendText(channel, inbound.senderPhone,
      result.count || alreadyMine ? 'Ticket assigned to you. You can now REPLY.' : 'Ticket already assigned to another employee.');
    return;
  }
  if (conversation.assignedWazoUserId !== member.wazoUserId) {
    await meta.sendText(channel, inbound.senderPhone, 'Claim this ticket before replying or closing.');
    return;
  }
  if (command.action === 'CLOSE') {
    await prisma.waConversation.updateMany({ where: {
      id: conversation.id, status: 'OPEN', assignedWazoUserId: member.wazoUserId,
    }, data: { status: 'CLOSED' }});
    await meta.sendText(channel, inbound.senderPhone, 'Ticket closed.');
    return;
  }
  if (!command.body) {
    await meta.sendText(channel, inbound.senderPhone, 'Provide reply text after ticket ID.');
    return;
  }
  await customerSend(channel, conversation, command.body);
  await prisma.waInbound.update({ where: { id: inbound.id }, data: { conversationId: conversation.id } });
  await prisma.waConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await meta.sendText(channel, inbound.senderPhone, 'Your message was submitted to the customer.');
}

async function processInbound(prisma, inbound) {
  const channel = await prisma.waChannel.findUnique({ where: { id: inbound.channelId } });
  if (!channel?.enabled) return;
  const staff = await prisma.waMember.findMany({ where: {
    channelId: channel.id, phone: inbound.senderPhone, enabled: true,
  }});
  if (staff.length) return handleStaff(prisma, channel, inbound, staff);

  let conversation = await prisma.waConversation.upsert({
    where: { channelId_customerPhone: {
      channelId: channel.id, customerPhone: inbound.senderPhone,
    }},
    create: { channelId: channel.id, customerPhone: inbound.senderPhone, status: 'SELECTING' },
    update: {},
  });
  const timestamp = Number(inbound.payload?.timestamp);
  const receivedAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000) : inbound.createdAt;
  const customerWindowUntil = new Date(receivedAt.getTime() + 24 * 3600 * 1000);
  conversation = await prisma.waConversation.update({ where: { id: conversation.id }, data: {
    customerWindowUntil,
    ...(conversation.status === 'CLOSED' ? {
      status: 'SELECTING', assignedWazoUserId: null, departmentCode: null,
    } : {}),
  }});
  await prisma.waInbound.update({ where: { id: inbound.id }, data: {
    conversationId: conversation.id,
  }});

  let messageToDistribute = inbound;
  if (conversation.status === 'SELECTING') {
    const departments = await prisma.waDepartment.findMany({ where: {
      channelId: channel.id, enabled: true,
    }, orderBy: { name: 'asc' }});
    if (!departments.length) {
      conversation = await prisma.waConversation.update({ where: { id: conversation.id }, data: {
        status: 'OPEN', departmentCode: null,
      }});
    } else {
      const selected = departments.find(d =>
        inbound.messageText === `dept:${d.code}` ||
        inbound.messageText?.trim().toLowerCase() === d.code.toLowerCase());
      if (!selected) {
        await meta.sendMenu(channel, inbound.senderPhone, departments);
        console.log('[WhatsApp] Department menu sent', { ticket: conversation.id });
        return;
      }
      conversation = await prisma.waConversation.update({ where: { id: conversation.id }, data: {
        status: 'OPEN', departmentCode: selected.code,
      }});
      // The reply `dept:sales` is not the customer inquiry. Recover the most
      // recent actual message sent before selecting the department.
      const previous = await prisma.waInbound.findMany({ where: {
        channelId: channel.id, conversationId: conversation.id,
        senderPhone: inbound.senderPhone, id: { not: inbound.id },
        messageText: { not: null },
      }, orderBy: { createdAt: 'desc' }, take: 20 });
      const original = previous.find(item =>
        !/^dept:[a-z0-9_-]+$/i.test(item.messageText.trim()) &&
        !departments.some(d => item.messageText.trim().toLowerCase() === d.code.toLowerCase()));
      if (original) messageToDistribute = original;
      await customerSend(channel, conversation, `Connected to ${selected.name}. An employee will assist you.`);
    }
  }
  await notifyMembers(prisma, channel, conversation, messageToDistribute);
}

module.exports = { processInbound, parseCommand };
