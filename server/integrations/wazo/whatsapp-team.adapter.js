'use strict';
const { getToken } = require('./wazo.auth');
const departmentRepo = require('../../repository/department.repository');
const employeeRepo = require('../../repository/employee.repository');

function ensureTenant(organization) {
  if (!organization || organization.status !== 'ACTIVE' || !organization.wazoTenantUuid) {
    throw new Error('Active organization with provisioned Wazo tenant required');
  }
  return organization.wazoTenantUuid;
}
function assertOwned(object, tenant, what) {
  if (!object || object.tenant_uuid !== tenant) throw new Error(`${what} not found in organization Wazo tenant`);
  return object;
}
function queueHasUser(queue, user) {
  if (!Array.isArray(queue.members?.users)) throw new Error('Incomplete Wazo queue membership response');
  return queue.members.users.some(m =>
    (user.uuid && m.uuid === user.uuid) || Number(m.id) === Number(user.id));
}
async function getUser(organization, rawUserId) {
  const tenant = ensureTenant(organization);
  const userId = Number(rawUserId);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid Wazo user ID');
  const user = assertOwned(await employeeRepo.getUser(await getToken(), tenant, userId), tenant, 'Employee');
  if (user.enabled !== true) throw new Error('Wazo employee is disabled');
  return user;
}
async function getQueue(organization, rawQueueId) {
  const tenant = ensureTenant(organization);
  const queueId = Number(rawQueueId);
  if (!Number.isSafeInteger(queueId) || queueId <= 0) throw new Error('Invalid Wazo queue ID');
  return assertOwned(await departmentRepo.get(await getToken(), tenant, queueId), tenant, 'Department');
}
async function validateMember(organization, wazoUserId, externalDepartmentId = null) {
  const user = await getUser(organization, wazoUserId);
  if (externalDepartmentId !== null) {
    const queue = await getQueue(organization, externalDepartmentId);
    if (!queueHasUser(queue, user)) throw new Error('Employee is not a member of this Wazo department');
  }
  return user;
}
module.exports = { getQueue, getUser, validateMember };
