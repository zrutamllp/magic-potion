import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import type { StaffMember } from '@magic-potion/shared';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputClass, randomPassword, useAction } from '../ui';

// Staff accounts. The main admin adds co-facilitators and sets their starting password (there
// is no email service, so the admin passes it on). Accounts stay across games.

export function StaffPage() {
  const { api } = useStaff();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<StaffMember[]>('/users').then(setStaff, (e: unknown) => setLoadError(errorText(e)));
  }, [api]);

  function replace(member: StaffMember) {
    setStaff((list) => {
      if (!list) return [member];
      return list.some((m) => m.id === member.id)
        ? list.map((m) => (m.id === member.id ? member : m))
        : [...list, member];
    });
  }

  return (
    <div className="max-w-5xl">
      <h1 className="mb-4 text-3xl font-extrabold text-brand-soft">Staff</h1>
      <div className="grid grid-cols-[1fr_22rem] items-start gap-5">
        <Panel title="Staff accounts">
          <Status error={loadError} />
          <ul className="divide-y divide-line">
            {staff?.map((m) => (
              <StaffRow key={m.id} member={m} onChange={replace} />
            ))}
          </ul>
        </Panel>
        <AddStaff onAdded={replace} />
      </div>
    </div>
  );
}

function StaffRow({
  member,
  onChange,
}: {
  member: StaffMember;
  onChange: (m: StaffMember) => void;
}) {
  const { api, login } = useStaff();
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const action = useAction();
  const isAdmin = member.role === 'MAIN_ADMIN';

  async function resetPassword() {
    const password = randomPassword();
    const done = await action.run(() => api.post(`/users/${member.id}/password`, { password }));
    if (done !== undefined) setNewPassword(password);
  }

  async function setActive(active: boolean) {
    const updated = await action.run(() =>
      api.patch<StaffMember>(`/users/${member.id}`, { active }),
    );
    if (updated) onChange(updated);
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`font-semibold ${member.active ? '' : 'text-ink-muted line-through'}`}>
            {member.name}
          </p>
          <p className="text-sm text-ink-muted">
            {member.email} · {isAdmin ? 'Main admin' : 'Co-facilitator'}
            {!member.active && ' · Switched off'}
          </p>
        </div>
        {!isAdmin && (
          <span className="flex gap-2">
            <SmallButton variant="outline" onClick={resetPassword} disabled={action.busy}>
              <KeyRound className="h-4 w-4" aria-hidden /> New password
            </SmallButton>
            {member.id !== login.staff.id && (
              <SmallButton
                variant="outline"
                tone={member.active ? 'danger' : 'success'}
                onClick={() => setActive(!member.active)}
                disabled={action.busy}
              >
                {member.active ? 'Switch off' : 'Switch on'}
              </SmallButton>
            )}
          </span>
        )}
      </div>
      {newPassword && (
        <p role="status" className="mt-1 rounded-lg bg-warning/10 px-3 py-1.5 text-base">
          New password for {member.name}: <b className="font-mono select-all">{newPassword}</b>{' '}
          (shown only now)
        </p>
      )}
      <Status error={action.error} />
    </li>
  );
}

function AddStaff({ onAdded }: { onAdded: (m: StaffMember) => void }) {
  const { api } = useStaff();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [added, setAdded] = useState<{ email: string; password: string } | null>(null);
  const action = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      action.setError('The password needs at least 8 characters.');
      return;
    }
    const member = await action.run(() =>
      api.post<StaffMember>('/users', { name, email, password }),
    );
    if (member) {
      onAdded(member);
      setAdded({ email: member.email, password });
      setName('');
      setEmail('');
      setPassword(randomPassword());
    }
  }

  return (
    <Panel title="Add a co-facilitator">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block font-semibold">
          Name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <label className="block font-semibold">
          Email
          <input
            type="email"
            className={`${inputClass} mt-1`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <div>
          <label htmlFor="new-staff-password" className="block font-semibold">
            Starting password
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="new-staff-password"
              className={`${inputClass} font-mono`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
            <SmallButton
              variant="outline"
              tone="muted"
              onClick={() => setPassword(randomPassword())}
            >
              Generate
            </SmallButton>
          </div>
        </div>
        <Status error={action.error} />
        {added && (
          <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-base">
            Added. Give them the staff login page, their email <b>{added.email}</b> and the password{' '}
            <b className="font-mono select-all">{added.password}</b>.
          </p>
        )}
        <SmallButton type="submit" disabled={action.busy}>
          <UserPlus className="h-4 w-4" aria-hidden /> {action.busy ? 'Adding…' : 'Add'}
        </SmallButton>
      </form>
    </Panel>
  );
}
