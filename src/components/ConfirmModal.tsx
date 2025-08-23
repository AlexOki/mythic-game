import React from 'react'

export default function ConfirmModal({ open, title, children, onConfirm, onCancel }:{
  open: boolean,
  title?: string,
  children?: React.ReactNode,
  onConfirm: ()=>void,
  onCancel: ()=>void,
}){
  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-slate-900 text-slate-100 rounded-lg p-4 w-80 shadow-lg">
        {title && <div className="font-semibold mb-2">{title}</div>}
        <div className="text-sm mb-4">{children}</div>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600" onClick={onCancel}>Cancel</button>
          <button className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}
