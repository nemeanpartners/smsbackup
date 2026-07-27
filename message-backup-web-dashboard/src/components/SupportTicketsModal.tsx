import { FormEvent, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { addTicketReply, createSupportTicket, fetchUserTickets, updateTicketStatus } from '../services/dbService';
import { SupportTicket } from '../types';
import { CheckCircle, MessageSquare, RefreshCw, Send, X } from 'lucide-react';

interface SupportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
}

function formatTicketDate(value?: string) {
  if (!value) return 'No date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusClass(status: SupportTicket['status']) {
  if (status === 'Resolved') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'In Progress') return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  if (status === 'Pending') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-slate-600 bg-slate-800 text-slate-300';
}

export function SupportTicketsModal({ isOpen, onClose, currentUser }: SupportTicketsModalProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.ticketId === selectedTicketId) || tickets[0] || null,
    [selectedTicketId, tickets]
  );

  const loadTickets = async () => {
    setLoading(true);
    setError('');
    try {
      const records = await fetchUserTickets(currentUser.uid, currentUser.email || undefined);
      setTickets(records);
      if (records.length > 0 && !records.some((ticket) => ticket.ticketId === selectedTicketId)) {
        setSelectedTicketId(records[0].ticketId);
      }
    } catch (err) {
      console.error('Failed to load support tickets', err);
      setError('Unable to load support tickets. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadTickets();
    }
  }, [isOpen, currentUser.uid]);

  if (!isOpen) return null;

  const handleCreateTicket = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!subject.trim() || !message.trim()) {
      setError('Enter a subject and message before sending a support request.');
      return;
    }

    setSaving(true);
    try {
      const ticket = await createSupportTicket(
        currentUser.displayName || 'Customer',
        currentUser.email || 'user@backup.local',
        subject.trim(),
        message.trim(),
        currentUser.uid
      );
      const updated = [ticket, ...tickets];
      setTickets(updated);
      setSelectedTicketId(ticket.ticketId);
      setSubject('');
      setMessage('');
      setNotice(`Support request ${ticket.ticketNumber} was sent.`);
    } catch (err) {
      console.error('Failed to create support ticket', err);
      setError('Unable to send the support request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updatedTicket = await addTicketReply(
        selectedTicket.ticketId,
        'user',
        currentUser.displayName || 'Customer',
        replyText.trim()
      );
      await updateTicketStatus(selectedTicket.ticketId, 'Open');
      setTickets((existing) =>
        existing.map((ticket) =>
          ticket.ticketId === selectedTicket.ticketId
            ? { ...updatedTicket, status: 'Open' }
            : ticket
        )
      );
      setReplyText('');
      setNotice('Reply added to your support request.');
    } catch (err) {
      console.error('Failed to add support reply', err);
      setError('Unable to add your reply. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-2xl border border-slate-800 bg-[#111827] text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-blue-300">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white">Support tickets</h2>
              <p className="text-xs text-slate-400">View replies and send support requests for this account.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid max-h-[calc(88vh-73px)] grid-cols-1 overflow-y-auto lg:grid-cols-[360px_1fr]">
          <aside className="border-b border-slate-800 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-300">{tickets.length} ticket{tickets.length === 1 ? '' : 's'}</p>
              <button
                type="button"
                onClick={loadTickets}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="space-y-2">
              {tickets.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  No support tickets yet.
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.ticketId}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.ticketId)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedTicket?.ticketId === ticket.ticketId
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-white">{ticket.subject || 'Support request'}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500">{ticket.ticketNumber}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatTicketDate(ticket.updatedAt || ticket.createdAt)}</p>
                    {ticket.replies?.some((reply) => reply.sender === 'admin') && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle className="h-3 w-3" />
                        Support replied
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className="space-y-4 p-4">
            {(error || notice) && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                {error || notice}
              </div>
            )}

            {selectedTicket && (
              <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{selectedTicket.ticketNumber}</p>
                    <h3 className="text-base font-bold text-white">{selectedTicket.subject || 'Support request'}</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatTicketDate(selectedTicket.createdAt)}</p>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(selectedTicket.status)}`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0b0f19] p-3">
                  <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">Your message</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{selectedTicket.message}</p>
                </div>

                <div className="mt-4 space-y-3">
                  {(selectedTicket.replies || []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-800 p-3 text-sm text-slate-500">
                      No replies yet.
                    </p>
                  ) : (
                    selectedTicket.replies.map((reply) => (
                      <article
                        key={reply.replyId}
                        className={`rounded-lg border p-3 ${
                          reply.sender === 'admin'
                            ? 'border-emerald-500/25 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900/60'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-white">
                            {reply.sender === 'admin' ? 'Support reply' : reply.senderName || 'You'}
                          </p>
                          <p className="text-[10px] text-slate-500">{formatTicketDate(reply.createdAt)}</p>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{reply.text}</p>
                      </article>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Reply to this ticket..."
                    className="h-24 resize-none rounded-lg border border-slate-700 bg-[#0b0f19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={saving || !replyText.trim()}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send reply
                  </button>
                </div>
              </section>
            )}

            <form onSubmit={handleCreateTicket} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="mb-3 text-sm font-bold text-white">New support request</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-lg border border-slate-700 bg-[#0b0f19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Tell support what happened..."
                  className="h-28 w-full resize-none rounded-lg border border-slate-700 bg-[#0b0f19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={saving || !subject.trim() || !message.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send support request
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
