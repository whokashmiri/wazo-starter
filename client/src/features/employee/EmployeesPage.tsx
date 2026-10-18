
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Headset,
  Loader2,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { getApiErrorMessage } from "../../api/client";
import { companiesApi } from "../companies/companies.api";
import { employeesApi } from "./employees.api";

import type {
  PhonePreviewResponse,
  PhoneProvisionResponse,
  WazoEmployee,
} from "./types";

type DialogMode = "closed" | "create" | "phone" | "credentials";

function employeeName(employee: WazoEmployee) {
  return [employee.firstname, employee.lastname]
    .filter(Boolean)
    .join(" ");
}

function getEmployees(data: unknown): WazoEmployee[] {
  if (Array.isArray(data)) return data as WazoEmployee[];

  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
  ) {
    return data.items as WazoEmployee[];
  }

  return [];
}



export default function EmployeesPage() {
  const queryClient = useQueryClient();

  const [tenantUuid, setTenantUuid] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogMode>("closed");
  const [selectedEmployee, setSelectedEmployee] =
    useState<WazoEmployee | null>(null);

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [extension, setExtension] = useState("");
  const [formError, setFormError] = useState("");

  const [preview, setPreview] =
    useState<PhonePreviewResponse | null>(null);

  const [credentials, setCredentials] =
    useState<PhoneProvisionResponse | null>(null);

  const [showSipPassword, setShowSipPassword] =
    useState(false);

  const companiesQuery = useQuery({
    queryKey: ["account", "companies"],
    queryFn: companiesApi.listMine,
  });

  const activeCompanies = useMemo(
    () =>
      (companiesQuery.data || []).filter(
        (company) =>
          company.status === "ACTIVE" &&
          company.wazoTenantUuid &&
          company.memberships.some(
            (membership) =>
              membership.role === "COMPANY_ADMIN" ||
              membership.role === "SUPERVISOR"
          )
      ),
    [companiesQuery.data]
  );

  useEffect(() => {
    if (
      tenantUuid &&
      activeCompanies.some(
        (company) => company.wazoTenantUuid === tenantUuid
      )
    ) {
      return;
    }

    setTenantUuid(activeCompanies[0]?.wazoTenantUuid || "");
  }, [activeCompanies, tenantUuid]);

  const selectedCompany = activeCompanies.find(
    (company) => company.wazoTenantUuid === tenantUuid
  );

  const canManage =
    selectedCompany?.memberships.some(
      (membership) => membership.role === "COMPANY_ADMIN"
    ) ?? false;

  const employeesQuery = useQuery({
    queryKey: ["employees", tenantUuid],
    queryFn: () => employeesApi.list(tenantUuid),
    enabled: Boolean(tenantUuid),
  });

  const callingSetupQuery = useQuery({
    queryKey: ["calling-setup", tenantUuid],
    queryFn: () => employeesApi.getCallingSetup(tenantUuid),
    enabled: Boolean(tenantUuid),
  });

  const employees = getEmployees(employeesQuery.data);

  const filteredEmployees = employees.filter((employee) => {
    const value = `${employeeName(employee)} ${employee.id}`
      .toLowerCase();

    return value.includes(search.toLowerCase().trim());
  });

  const usedExtensions = new Set(
    (callingSetupQuery.data?.extensions?.items || []).map(
      (item) => `${item.context}:${item.exten}`
    )
  );

  const availableContexts =
    callingSetupQuery.data?.contexts?.items.filter(
      (context) =>
        context.tenant_uuid === tenantUuid &&
        context.type === "internal" &&
        context.enabled
    ) || [];

  const createMutation = useMutation({
    mutationFn: (payload: {
      firstname: string;
      lastname: string;
    }) => employeesApi.create(tenantUuid, payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["employees", tenantUuid],
      });

      setDialog("closed");
      setFirstname("");
      setLastname("");
      setFormError("");
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({
      userId,
      extension: requestedExtension,
    }: {
      userId: number;
      extension: string;
    }) =>
      employeesApi.previewPhone(
        tenantUuid,
        userId,
        requestedExtension
      ),

    onSuccess: (result) => {
      setPreview(result);
    },
  });

  const provisionMutation = useMutation({
    mutationFn: ({
      userId,
      extension: requestedExtension,
    }: {
      userId: number;
      extension: string;
    }) =>
      employeesApi.provisionPhone(
        tenantUuid,
        userId,
        requestedExtension
      ),

    onSuccess: async (result) => {
      setCredentials(result);
      setDialog("credentials");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["employees", tenantUuid],
        }),
        queryClient.invalidateQueries({
          queryKey: ["calling-setup", tenantUuid],
        }),
      ]);
    },
  });

  function resetDialog() {
    if (createMutation.isPending || provisionMutation.isPending) {
      return;
    }

    setDialog("closed");
    setSelectedEmployee(null);
    setPreview(null);
    setCredentials(null);
    setExtension("");
    setFirstname("");
    setLastname("");
    setFormError("");
    setShowSipPassword(false);

    previewMutation.reset();
    provisionMutation.reset();
    createMutation.reset();
  }

  function openCreateDialog() {
    createMutation.reset();
    setFormError("");
    setDialog("create");
  }

  function openPhoneDialog(employee: WazoEmployee) {
    previewMutation.reset();
    provisionMutation.reset();
    setSelectedEmployee(employee);
    setExtension("");
    setPreview(null);
    setFormError("");
    setDialog("phone");
  }

  function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) return;

    if (!firstname.trim()) {
      setFormError("First name is required.");
      return;
    }

    setFormError("");

    createMutation.mutate({
      firstname: firstname.trim(),
      lastname: lastname.trim(),
    });
  }

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !selectedEmployee) return;

    if (!/^[0-9]{2,10}$/.test(extension)) {
      setFormError("Extension must contain 2–10 digits.");
      return;
    }

    setFormError("");
    setPreview(null);
    previewMutation.reset();

    previewMutation.mutate({
      userId: selectedEmployee.id,
      extension,
    });
  }

  function confirmProvision() {
    if (!canManage || !selectedEmployee || !preview?.ready) {
      return;
    }

    if (preview.extension !== extension) return;

    provisionMutation.mutate({
      userId: selectedEmployee.id,
      extension,
    });
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setFormError("Copy failed. Please select and copy the value.");
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="rounded-xl border border-border p-2.5 text-primary hover:bg-cream"
          >
            <ArrowLeft size={19} />
          </Link>

          <div className="rounded-xl bg-primary p-2.5 text-white">
            <Headset size={20} />
          </div>

          <div>
            <h1 className="font-bold text-primary">
              Contact Center Cloud
            </h1>
            <p className="text-xs text-muted">
              Company / Employees
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-primary">
              Employees
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage Wazo employees and SIP extensions.
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openCreateDialog}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90"
            >
              <Plus size={18} />
              Add Employee
            </button>
          )}
        </div>

        {companiesQuery.isPending ? (
          <div className="flex items-center gap-2 text-muted">
            <Loader2 className="animate-spin" size={18} />
            Loading companies...
          </div>
        ) : companiesQuery.isError ? (
          <div role="alert" className="rounded-xl bg-danger-background p-4 text-danger">
            {getApiErrorMessage(companiesQuery.error)}
          </div>
        ) : activeCompanies.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8">
            <BuildingEmpty />
            <h3 className="mt-4 text-lg font-bold text-primary">
              No active company available
            </h3>
            <p className="mt-2 text-sm text-muted">
              Your company must be approved and provisioned
              before employee management is available.
            </p>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex items-center gap-2 font-semibold text-primary"
            >
              Back to dashboard <ChevronRight size={17} />
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-white p-5">
              <label
                htmlFor="company-select"
                className="mb-2 block text-sm font-semibold text-primary"
              >
                Company
              </label>

              <select
                id="company-select"
                value={tenantUuid}
                onChange={(event) => {
                  resetDialog();
                  setTenantUuid(event.target.value);
                }}
                className="w-full max-w-md rounded-xl border border-border bg-white px-4 py-3 text-primary outline-none focus:border-primary"
              >
                {activeCompanies.map((company) => (
                  <option
                    key={company.id}
                    value={company.wazoTenantUuid || ""}
                  >
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                icon={Users}
                label="Total employees"
                value={employees.length}
              />
              <Metric
                icon={Phone}
                label="Employees with lines"
                value={
                  employees.filter(
                    (employee) => (employee.lines?.length || 0) > 0
                  ).length
                }
              />
              <Metric
                icon={ShieldCheck}
                label="Active employees"
                value={
                  employees.filter(
                    (employee) => employee.enabled !== false
                  ).length
                }
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <h3 className="text-lg font-bold text-primary">
                  Employee Directory
                </h3>

                <div className="relative w-full sm:w-72">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employees..."
                    className="w-full rounded-xl border border-border py-2.5 pl-10 pr-3 text-sm text-primary outline-none focus:border-primary"
                  />
                </div>
              </div>

              {employeesQuery.isPending ? (
                <div className="p-10 text-center text-muted">
                  Loading employees...
                </div>
              ) : employeesQuery.isError ? (
                <div role="alert" className="p-6 text-danger">
                  {getApiErrorMessage(employeesQuery.error)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-155 text-left">
                    <thead className="bg-cream/50 text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-5 py-4">Employee</th>
                        <th className="px-5 py-4">Wazo ID</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Phone setup</th>
                        <th className="px-5 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredEmployees.map((employee) => {
                        const configured =
                          (employee.lines?.length || 0) > 0;

                        return (
                          <tr key={employee.id}>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <span className="rounded-full bg-cream p-2.5 text-primary">
                                  <UserRound size={18} />
                                </span>
                                <span className="font-semibold text-primary">
                                  {employeeName(employee)}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-muted">
                              {employee.id}
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm text-primary">
                                {employee.enabled === false
                                  ? "Disabled"
                                  : "Enabled"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={
                                  configured
                                    ? "rounded-full bg-success-background px-3 py-1 text-xs font-semibold text-success"
                                    : "rounded-full bg-cream px-3 py-1 text-xs font-semibold text-primary"
                                }
                              >
                                {configured ? "Configured" : "Not configured"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {canManage &&
                                !configured &&
                                employee.enabled !== false && (
                                  <button
                                    type="button"
                                    onClick={() => openPhoneDialog(employee)}
                                    className="text-sm font-semibold text-primary hover:underline"
                                  >
                                    Setup phone
                                  </button>
                                )}
                            </td>
                          </tr>
                        );
                      })}

                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-10 text-center text-sm text-muted">
                            No employees found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {dialog !== "closed" && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-dialog-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="employee-dialog-title"
                  className="text-xl font-bold text-primary"
                >
                  {dialog === "create"
                    ? "Add Employee"
                    : dialog === "phone"
                      ? "Configure SIP Phone"
                      : "SIP Credentials"}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {dialog === "create"
                    ? "Create a Wazo employee for this company."
                    : dialog === "phone"
                      ? employeeName(selectedEmployee!)
                      : "Save these credentials securely."}
                </p>
              </div>

              <button
                type="button"
                onClick={resetDialog}
                disabled={
                  createMutation.isPending ||
                  provisionMutation.isPending
                }
                aria-label="Close dialog"
                className="rounded-lg p-2 text-muted hover:bg-cream hover:text-primary disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {dialog === "create" && (
              <form onSubmit={submitEmployee} className="space-y-4">
                <Field
                  label="First name"
                  value={firstname}
                  onChange={setFirstname}
                  maxLength={60}
                  required
                />
                <Field
                  label="Last name"
                  value={lastname}
                  onChange={setLastname}
                  maxLength={60}
                />

                {formError && <ErrorMessage message={formError} />}

                {createMutation.isError && (
                  <ErrorMessage
                    message={getApiErrorMessage(createMutation.error)}
                  />
                )}

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {createMutation.isPending && (
                    <Loader2 size={18} className="animate-spin" />
                  )}
                  Create Employee
                </button>
              </form>
            )}

            {dialog === "phone" && selectedEmployee && (
              <form onSubmit={submitPreview} className="space-y-4">
                <div className="rounded-xl bg-cream/45 p-4 text-sm text-primary">
                  <p className="font-semibold">
                    {employeeName(selectedEmployee)}
                  </p>
                  <p>Wazo user ID: {selectedEmployee.id}</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-primary">
                    SIP extension
                  </label>
                  <input
                    required
                    value={extension}
                    onChange={(event) => {
                      setExtension(event.target.value);
                      setPreview(null);
                      previewMutation.reset();
                    }}
                    placeholder="1000"
                    inputMode="numeric"
                    maxLength={10}
                    className="w-full rounded-xl border border-border px-4 py-3 text-primary outline-none focus:border-primary"
                  />
                  <p className="mt-2 text-xs text-muted">
                    Your Wazo context must permit the extension.
                    Available internal contexts: {availableContexts.length}.
                    Existing extension entries: {usedExtensions.size}.
                  </p>
                </div>

                {formError && <ErrorMessage message={formError} />}

                {previewMutation.isError && (
                  <ErrorMessage
                    message={getApiErrorMessage(previewMutation.error)}
                  />
                )}

                {provisionMutation.isError && (
                  <ErrorMessage
                    message={getApiErrorMessage(provisionMutation.error)}
                  />
                )}

                {preview && (
                  <div className="space-y-2 rounded-xl border border-success/20 bg-success-background p-4 text-sm text-success">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 size={18} />
                      Phone setup preview passed
                    </div>
                    <p>Extension: {preview.extension}</p>
                    <p>Context: {preview.context.name}</p>
                  </div>
                )}

                {!preview ? (
                  <button
                    type="submit"
                    disabled={previewMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {previewMutation.isPending && (
                      <Loader2 size={18} className="animate-spin" />
                    )}
                    Preview Phone Setup
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={confirmProvision}
                    disabled={provisionMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {provisionMutation.isPending && (
                      <Loader2 size={18} className="animate-spin" />
                    )}
                    {provisionMutation.isPending
                      ? "Provisioning..."
                      : "Confirm & Provision SIP Phone"}
                  </button>
                )}
              </form>
            )}

            {dialog === "credentials" && credentials && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-xl bg-success-background p-4 text-sm font-medium text-success">
                  <CheckCircle2 size={19} />
                  SIP phone provisioned successfully
                </div>

                <Credential
                  label="Extension"
                  value={credentials.phone.extension}
                  onCopy={copyValue}
                />
                <Credential
                  label="SIP Username"
                  value={credentials.sipCredentials.username}
                  onCopy={copyValue}
                />
                <Credential
                  label="SIP Password"
                  value={credentials.sipCredentials.password}
                  secret={!showSipPassword}
                  onCopy={copyValue}
                  toggleSecret={() =>
                    setShowSipPassword((previous) => !previous)
                  }
                />

                {formError && <ErrorMessage message={formError} />}

                <p className="rounded-xl bg-cream/50 p-4 text-sm text-primary">
                  These credentials are displayed once. Store them
                  securely before closing this window. You may also
                  need your Wazo SIP server hostname and port,
                  which are not returned by this endpoint.
                </p>

                <button
                  type="button"
                  onClick={resetDialog}
                  className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white"
                >
                  I have saved the credentials
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingEmpty() {
  return (
    <span className="inline-flex rounded-2xl bg-cream p-4 text-primary">
      <Headset size={27} />
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <Icon size={22} className="mb-3 text-primary" />
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-primary">
        {label}
      </label>
      <input
        type="text"
        required={required}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border px-4 py-3 text-primary outline-none focus:border-primary"
      />
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/20 bg-danger-background p-4 text-sm text-danger"
    >
      {message}
    </div>
  );
}

function Credential({
  label,
  value,
  secret,
  onCopy,
  toggleSecret,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: (value: string) => void;
  toggleSecret?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="mb-2 text-xs font-semibold text-muted">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm text-primary">
          {secret ? "••••••••••••••••" : value}
        </span>

        {toggleSecret && (
          <button
            type="button"
            onClick={toggleSecret}
            aria-label={secret ? "Show password" : "Hide password"}
            className="rounded-lg p-2 text-muted hover:bg-cream"
          >
            {secret ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => onCopy(value)}
          aria-label={`Copy ${label}`}
          className="rounded-lg p-2 text-muted hover:bg-cream"
        >
          <Copy size={17} />
        </button>
      </div>
    </div>
  );
}
