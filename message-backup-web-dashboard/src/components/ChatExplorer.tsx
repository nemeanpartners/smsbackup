import { useState, useEffect } from 'react';
import { ChatRecord, MessageRecord } from '../types';
import { fetchBackupChats, fetchChatMessages } from '../services/dbService';
import { Search, ChevronRight, MessageSquare, Shield, Calendar, Filter } from 'lucide-react';

interface ChatExplorerProps {
  userId: string;
  backupId: string | null;
  isAdmin?: boolean;
}

export function ChatExplorer({ userId, backupId, isAdmin = false }: ChatExplorerProps) {
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [activeServiceFilter, setActiveServiceFilter] = useState<'All' | 'iMessage' | 'SMS' | 'WhatsApp'>('All');

  // Fetch chats when backup changes
  useEffect(() => {
    if (!backupId) return;
    
    const loadChats = async () => {
      setLoadingChats(true);
      setSelectedChat(null);
      setMessages([]);
      try {
        const list = await fetchBackupChats(userId, backupId, isAdmin);
        setChats(list);
        if (list.length > 0) {
          setSelectedChat(list[0]);
        }
      } catch (err) {
        console.error('Failed to load backup chats', err);
      } finally {
        setLoadingChats(false);
      }
    };
    
    loadChats();
  }, [userId, backupId]);

  // Fetch messages when selected chat changes
  useEffect(() => {
    if (!selectedChat) return;
    
    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const list = await fetchChatMessages(userId, selectedChat.chatId, isAdmin);
        setMessages(list);
      } catch (err) {
        console.error('Failed to load messages', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    
    loadMessages();
  }, [userId, selectedChat]);

  // Filter threads on search & platform
  const filteredChats = chats.filter(c => {
    const matchesSearch = c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.contactIdentifier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesService = activeServiceFilter === 'All' || c.service === activeServiceFilter;
    return matchesSearch && matchesService;
  });

  // Highlight matches function
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) 
            ? <mark key={i} className="bg-yellow-500/30 text-yellow-250 border border-yellow-500/20 px-0.5 rounded text-slate-100">{part}</mark> 
            : part
        )}
      </>
    );
  };

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'iMessage': return 'bg-blue-600/10 text-blue-400 border border-blue-500/25';
      case 'SMS': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
      case 'WhatsApp': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25';
      default: return 'bg-slate-600/10 text-slate-400';
    }
  };

  if (!backupId) {
    return (
      <div id="explorer-placeholder" className="bg-[#161f30]/40 border border-slate-800/80 rounded-xl p-12 text-center">
        <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-slate-400 font-medium font-display">Select a macOS Backup run above</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
          Click on one of your MacBook backup containers to examine message histories, threads, and platform metrics.
        </p>
      </div>
    );
  }

  return (
    <div id="message-explorer" className="bg-[#161f30]/40 border border-slate-800/80 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[600px] shadow-lg">
      
      {/* LEFT PANEL: CHAT LIST */}
      <div className="md:col-span-4 border-r border-slate-800/80 flex flex-col bg-[#111827]/45">
        
        {/* Search contacts bar */}
        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="contact-search-input"
              type="text"
              placeholder="Search chat or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-800 hover:border-slate-700/80 rounded-lg py-2 pl-9 pr-4 text-slate-300 text-xs focus:outline-none focus:border-blue-500/80 transition"
            />
          </div>
        </div>

        {/* Platform selection filters */}
        <div className="px-4 py-3 bg-[#0d1321]/60 flex items-center justify-between border-b border-slate-800/60 overflow-x-auto gap-2">
          <span className="text-[10px] uppercase font-mono text-slate-500 flex items-center gap-1"><Filter className="w-3 h-3" /> Filters</span>
          <div className="flex gap-1.5 scrollbar-thin">
            {(['All', 'iMessage', 'SMS', 'WhatsApp'] as const).map(f => (
              <button
                id={`filter-${f}`}
                key={f}
                type="button"
                onClick={() => {
                  setActiveServiceFilter(f);
                  setSelectedChat(null);
                }}
                className={`text-[10px] font-medium font-mono px-2.5 py-1.2 rounded transition active:scale-95 ${
                  activeServiceFilter === f 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-[#161f30] text-slate-400 hover:bg-slate-850'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Chats lists block */}
        <div className="flex-1 overflow-y-auto max-h-[500px]">
          {loadingChats ? (
            <div className="py-12 text-center text-slate-500 text-xs">Loading conversations database...</div>
          ) : filteredChats.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs px-4">
              No matching conversation threads found for this filter.
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = selectedChat?.chatId === c.chatId;
              return (
                <div
                  id={`chat-thread-${c.chatId}`}
                  key={c.chatId}
                  onClick={() => setSelectedChat(c)}
                  className={`p-4 border-b border-slate-800/40 hover:bg-[#161f30]/30 transition cursor-pointer flex items-center justify-between ${
                    isSelected ? 'bg-blue-600/5 hover:bg-blue-600/5' : ''
                  }`}
                >
                  <div className="space-y-1.5 w-full pr-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-200 text-xs truncate max-w-[150px]">{c.contactName}</h4>
                      <span className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-full ${getServiceColor(c.service)}`}>
                        {c.service}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-[190px]">
                      {c.lastMessageText || 'No backup text recorded'}
                    </p>
                    <p className="text-[9px] font-mono text-slate-500">
                      {c.contactIdentifier}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: CHAT HISTORIES Viewer */}
      <div className="md:col-span-8 flex flex-col bg-[#0d1321]/45 min-h-[550px]">
        {selectedChat ? (
          <>
            {/* Top Contact Banner Header */}
            <div id="chat-header" className="p-4 border-b border-slate-800 bg-[#0d1421]/90 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="space-y-0.5">
                <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                  {selectedChat.contactName}
                  <span className={`text-[9px] font-mono font-bold px-1.8 py-0.2 rounded-full ${getServiceColor(selectedChat.service)}`}>
                    {selectedChat.service}
                  </span>
                </h3>
                <p className="text-[10px] font-mono text-slate-500 font-mono">
                  {selectedChat.contactIdentifier} • id: {selectedChat.chatId.split('_')[0]}
                </p>
              </div>

              {/* Message searching */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-500">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  id="message-text-search"
                  type="text"
                  placeholder="Find in messages..."
                  value={messageSearchTerm}
                  onChange={(e) => setMessageSearchTerm(e.target.value)}
                  className="bg-[#0b0f19] border border-slate-800 focus:border-slate-700 hover:border-slate-800 rounded-md py-1.2 pl-8 pr-3 text-slate-300 text-[11px] focus:outline-none transition w-full sm:w-44"
                />
              </div>
            </div>

            {/* Scrolling speech logs list */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 max-h-[420px] bg-[#070b13]/65 relative">
              {loadingMessages ? (
                <div className="absolute inset-0 bg-[#0d1321]/45 flex items-center justify-center text-slate-400 text-xs">
                  Loading message archive payload...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs font-sans">
                  No logged messages found inside this database.
                </div>
              ) : (
                messages
                  .filter(m => m.text.toLowerCase().includes(messageSearchTerm.toLowerCase()))
                  .map((m) => {
                    const isMe = m.isFromMe;
                    return (
                      <div 
                        id={`msg-block-${m.messageId}`}
                        key={m.messageId} 
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        {/* Message body container */}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs select-text shadow-sm ${
                          isMe 
                            ? 'chat-me rounded-tr-none' 
                            : 'chat-other rounded-tl-none border border-slate-800/50'
                        }`}>
                          <p className="leading-relaxed leading-word">{highlightText(m.text, messageSearchTerm)}</p>
                        </div>

                        {/* Timestamp signature details */}
                        <span className="text-[9px] font-mono text-slate-500 mt-1 px-1 flex items-center gap-1 font-sans">
                          {isMe ? 'You' : m.senderIdentifier || 'received'} • {
                            m.timestamp ? m.timestamp.substring(11, 16) : 'syncing'
                          }
                        </span>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Bottom info banner */}
            <div className="p-3 border-t border-slate-800 bg-[#111827]/30 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 font-sans">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                Vault Enclosure Database Immutable Logs
              </span>
              <span className="font-mono flex items-center gap-1 font-sans">
                <Calendar className="w-3.5 h-3.5" /> Checked {new Date().toLocaleDateString()}
              </span>
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center text-slate-500 text-xs">
            <MessageSquare className="w-10 h-10 text-slate-700 mb-2" />
            No chat conversation thread selected.
          </div>
        )}
      </div>
    </div>
  );
}
