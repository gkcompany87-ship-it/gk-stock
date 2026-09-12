"use client";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, CheckCircle2, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = { open:boolean; onClose:()=>void; onDetected:(value:string)=>void };
export function BarcodeScannerModal({open,onClose,onDetected}:Props){
  const videoRef=useRef<HTMLVideoElement>(null); const controlsRef=useRef<IScannerControls|null>(null); const detectedRef=useRef(false);
  const[error,setError]=useState(""); const[starting,setStarting]=useState(false); const[detected,setDetected]=useState("");
  useEffect(()=>{if(!open){controlsRef.current?.stop();controlsRef.current=null;detectedRef.current=false;setDetected("");setError("");return;}let cancelled=false;
    async function start(){if(!videoRef.current)return;setStarting(true);setError("");setDetected("");detectedRef.current=false;try{const reader=new BrowserMultiFormatReader();const controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"}}},videoRef.current,(result)=>{if(!result||detectedRef.current)return;const value=result.getText().trim();if(!value)return;detectedRef.current=true;setDetected(value);controlsRef.current?.stop();window.setTimeout(()=>{if(!cancelled){onDetected(value);onClose();}},300);});if(cancelled)controls.stop();else controlsRef.current=controls;}catch{setError("Impossible d’accéder à la caméra. Vérifiez l’autorisation caméra du navigateur.");}finally{if(!cancelled)setStarting(false);}}
    void start(); return()=>{cancelled=true;controlsRef.current?.stop();controlsRef.current=null;};
  },[open,onClose,onDetected]);
  if(!open)return null;
  return <><div className="dialog-overlay scanner-overlay" onClick={onClose}/><div className="dialog-content scanner-dialog" role="dialog" aria-modal="true" aria-label="Scanner un code-barres"><button type="button" className="dialog-close" onClick={onClose} aria-label="Fermer"><X size={20}/></button><div className="mb-5 flex items-center gap-3"><span className="rounded-lg bg-teal-50 p-2 text-teal-700"><ScanLine size={22}/></span><div><h2 className="text-lg font-bold text-slate-800">Scanner le code-barres</h2><p className="text-sm text-slate-500">Placez le code-barres ou QR code devant la caméra.</p></div></div><div className="scanner-frame"><video ref={videoRef} muted playsInline className="scanner-video"/><div className="scanner-target" aria-hidden="true"/>{starting&&<div className="scanner-starting"><Camera className="mr-2" size={18}/>Activation de la caméra...</div>}</div>{detected&&<div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={18}/>Code détecté : {detected}</div>}{error&&<div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}<p className="mt-4 text-xs text-slate-500">La caméra se ferme automatiquement après détection. Une douchette USB/Bluetooth fonctionne aussi directement dans le champ.</p></div></>;
}
