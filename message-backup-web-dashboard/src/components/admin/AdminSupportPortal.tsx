import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  addTicketReply,
  deleteSupportTicket,
  fetchAllTickets,
  updateTicketStatus
} from '../../services/dbService';
import { SupportTicket } from '../../types';
import { Clock, Mail, MessageSquare, RefreshCw, Trash2, Users } from 'lucide-react';

interface AdminSupportPortalProps {
  currentUser: User | null;
}

function formatTicketDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Unknown date';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function AdminSupportPortal({ currentUser }: AdminSupportPortalProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [error, setError] = useState('');

  const loadTickets = async () => {
    setIsLoading(true);
    setError('');
    try {
      const records = await fetchAllTickets();
      setTickets(records);
      if (selectedTicket) {
        const updated = records.find((ticket) => ticket.ticketId === selectedTicket.ticketId);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      console.error('Error fetching admin tickets:', err);
      setError('Unable to load support tickets. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setIsSendingReply(true);
    setError('');
    try {
      await addTicketReply(
        selectedTicket.ticketId,
        'admin',
        currentUser?.displayName || 'System Support Administrator',
        replyText.trim()
      );
      await updateTicketStatus(selectedTicket.ticketId, 'Resolved');
      setReplyText('');
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      console.error('Failed to send ticket reply:', err);
      setError('Unable to save the reply. Please try again.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const removeTicket = async (ticketId: string) => {
    const confirmed = window.confirm('Delete this support ticket?');
    if (!confirmed) return;
    setError('');
    try {
      await deleteSupportTicket(ticketId);
      if (selectedTicket?.ticketId === ticketId) {
        setSelectedTicket(null);
        setReplyText('');
      }
      await loadTickets();
    } catch (err) {
      console.error('Failed to delete ticket:', err);
      setError('Unable to delete this ticket. Please try again.');
    }
  };

  const uniqueUsers = new Set(tickets.map((ticket) => ticket.email.trim().toLowerCase()).filter(Boolean)).size;
  const pendingCount = tickets.filter((ticket) => (
    ticket.status === 'Open' ||
    ticket.status === 'In Progress' ||
    ticket.status === 'Pending'
  )).length;

  const getAdminReply = (ticket: SupportTicket) => {
    const replies = ticket.replies || [];
    const adminReplies = replies.filter((reply) => reply.sender === 'admin');
    return adminReplies.length > 0 ? adminReplies[adminReplies.length - 1].text : '';
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <Users className="w-4 h-4 text-blue-400 mb-3" />
          <p className="text-2xl font-bold text-white">{uniqueUsers}</p>
          <p className="text-xs text-slate-500">Customers with tickets</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <MessageSquare className="w-4 h-4 text-indigo-300 mb-3" />
          <p className="text-2xl font-bold text-white">{tickets.length}</p>
          <p className="text-xs text-slate-500">Total inquiries</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <Clock className="w-4 h-4 text-amber-300 mb-3" />
          <p className="text-2xl font-bold text-white">{pendingCount}</p>
          <p className="text-xs text-slate-500">Needs reply</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Customer support inquiries</h3>
              <p className="text-xs text-slate-500">Review incoming messages and formulate official replies.</p>
            </div>
            <button
              type="button"
              onClick={loadTickets}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {isLoading && tickets.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">Loading support tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No support tickets found.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {tickets.map((ticket) => {
                const adminReply = getAdminReply(ticket);
                const replied = Boolean(adminReply) || ticket.status === 'Resolved';
                const isSelected = selectedTicket?.ticketId === ticket.ticketId;

                return (
                  <article key={ticket.ticketId} className={`px-4 py-4 transition ${isSelected ? 'bg-blue-500/10' : 'hover:bg-slate-900/60'}`}>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">{ticket.name || 'Customer'}</h4>
                          <span className="text-xs text-slate-500">{ticket.email || 'No email'}</span>
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-mono uppercase text-slate-400">
                            {ticket.ticketNumber}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            replied
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          }`}>
                            {replied ? 'Replied' : 'Unresolved'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-300">{ticket.subject || 'Support request'}</p>
                        <p className="text-sm text-slate-400 leading-relaxed">{ticket.message}</p>
                        {adminReply && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                            <p className="text-[11px] font-bold text-emerald-300 mb-1">Support Desk Response</p>
                            <p className="text-sm text-slate-200">{adminReply}</p>
                          </div>
                        )}
                        <p className="text-[10px] font-mono text-slate-600">Received: {formatTicketDate(ticket.createdAt)}</p>
                      </div>

                      <div className="flex lg:flex-col gap-2 lg:min-w-[150px]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setReplyText(adminReply);
                          }}
                          className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition"
                        >
                          {replied ? 'Edit Response' : 'Formulate Reply'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTicket(ticket.ticketId)}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-300 hover:border-red-500/40 transition"
                          title="Delete ticket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 sticky top-24">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <Mail className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">Support Reply Desk</h3>
          </div>

          {!selectedTicket ? (
            <div className="min-h-[220px] flex items-center justify-center text-center">
              <p className="text-sm text-slate-500 max-w-xs">
                Click Formulate Reply on a customer ticket to compose and save an official response.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Replying to</p>
                <p className="text-sm font-semibold text-white">{selectedTicket.name || 'Customer'}</p>
                <p className="text-xs text-slate-500 truncate">{selectedTicket.email}</p>
              </div>

              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Response message</span>
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Type your response here..."
                  className="mt-2 h-36 w-full resize-none rounded-lg border border-slate-700 bg-[#0b0f19] p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTicket(null);
                    setReplyText('');
                  }}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={isSendingReply || !replyText.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 transition"
                >
                  {isSendingReply ? 'Saving...' : 'Send Reply'}
                </button>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
