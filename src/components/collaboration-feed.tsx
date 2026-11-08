"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { MessagesSquare, ArrowUpRight } from "./ui/icons";

export interface CollaborationMessage {
  id: string;
  incidentId: string;
  text: string;
  createdAt: string;
  authorLabel: string;
  authorId?: string;
  incidentTitle?: string;
}

/** Read-only projection of subscribed messages. Posting stays in the scoped war room. */
export function CollaborationFeed({ messages, confirmed, onOpen, onOpenChat, compact = false }: {
  messages: CollaborationMessage[];
  confirmed: boolean;
  onOpen?: (incidentId: string) => void;
  onOpenChat?: () => void;
  compact?: boolean;
}) {
  const { instant } = useInterfaceMotion();
  const recent = confirmed ? [...messages].filter(m => Number.isFinite(Date.parse(m.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, compact ? 2 : 3) : [];
  return <section className={`panel bb-collaboration-panel${compact ? " bb-collaboration-compact" : ""}`} aria-label="Incident communications">
    <header className="panel-title"><div><h2>Team updates</h2><p>{compact ? "Messages in this incident" : "Messages from your assigned incidents"}</p></div><MessagesSquare size={18}/></header>
    <div className="bb-message-feed" role="log" aria-label="Recent team messages" aria-live="polite" aria-relevant="additions text">
      {recent.map(message => <motion.article key={message.id} className="bb-message-preview" initial={instant ? false : {opacity:0,transform:"translateY(4px)"}} animate={{opacity:1,transform:"translateY(0px)"}} transition={{duration:instant ? 0 : .18,ease:[.23,1,.32,1]}}>
        <header><strong>{message.authorLabel}</strong><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></header>
        <p>{message.text}</p>
        {!compact && (onOpen ? <button type="button" className="text-button bb-message-incident" onClick={() => onOpen(message.incidentId)}>{message.incidentTitle ?? "Open incident"}<ArrowUpRight size={14}/></button> : <a className="text-button bb-message-incident" href={`/incidents/${encodeURIComponent(message.incidentId)}#collaboration`}>{message.incidentTitle ?? "Open incident chat"}<ArrowUpRight size={14}/></a>)}
      </motion.article>)}
      {!recent.length && <div className="bb-message-empty"><MessagesSquare size={22}/><strong>{confirmed ? "No team messages yet" : "Waiting for confirmed messages"}</strong><p>{confirmed ? "Open an incident’s war room to share an observation or coordinate the next step." : "Messages appear after your incident access is confirmed."}</p></div>}
    </div>
    {compact && onOpenChat && <button type="button" className="panel-link" onClick={onOpenChat}>Open war room <ArrowUpRight size={14}/></button>}
  </section>;
}

export function ChatTranscript({ messages, renderControls }: {messages: CollaborationMessage[]; renderControls: (id: string) => ReactNode}) {
  const { instant } = useInterfaceMotion();
  const log = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const ordered = [...messages].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const lastId = ordered.at(-1)?.id;
  useLayoutEffect(() => {
    if (atEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lastId]);
  return <div ref={log} className="bb-warroom-log" role="log" aria-label="Server-recorded incident messages" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={event => { const node=event.currentTarget; atEnd.current=node.scrollHeight-node.scrollTop-node.clientHeight<48; }}>
    {ordered.map(message => <motion.article className="chat-message" key={message.id} initial={instant ? false : {opacity:0,transform:"translateY(4px)"}} animate={{opacity:1,transform:"translateY(0px)"}} transition={{duration:instant ? 0 : .18,ease:[.23,1,.32,1]}}>
      <div><header><strong>{message.authorLabel}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></header><p>{message.text}</p><details className="small"><summary>Message provenance</summary><dl className="record-details"><dt>Message ID</dt><dd><code>{message.id}</code></dd>{message.authorId && <><dt>Responder identity</dt><dd><code>{message.authorId}</code></dd></>}</dl></details>{renderControls(message.id)}</div>
    </motion.article>)}
    {!ordered.length && <div className="bb-message-empty"><strong>No messages recorded yet</strong><p>Share an observation, cite the evidence, or ask your team about the next decision.</p></div>}
  </div>;
}
