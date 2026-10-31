"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./primitives";
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null); const titleId=useId();
 useEffect(()=>{ const dialog=ref.current; dialog?.showModal(); return ()=>dialog?.close(); },[]);
 return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} onClick={e=>{if(e.target===e.currentTarget) onClose();}} className="fixed inset-0 m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto rounded-xl border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-black/20" aria-labelledby={titleId}><div className="mb-5 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">{title}</h2><Button variant="ghost" aria-label="Close dialog" onClick={onClose}><X size={18}/></Button></div>{children}</dialog>;
}
