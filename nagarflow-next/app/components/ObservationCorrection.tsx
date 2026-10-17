'use client';
import {useState} from 'react';
import {dispatchMutation,type DispatchRecord} from '../lib/dispatch';
export default function ObservationCorrection({record}:{record:DispatchRecord}){
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);setBusy(true);setError('');setMessage('');try{await dispatchMutation('observation',{dispatch_id:record.id,expected_revision:record.observation_revision,actual_demand:f.get('score')===''?null:Number(f.get('score')),reason:f.get('reason')});form.reset();setMessage('Correction recorded with an audit trail.');}catch(e){setError(e instanceof Error?e.message:'Correction failed. Reload the assignment.');}finally{setBusy(false);}}
 if(record.status!=='ARRIVED'||record.predicted_score===null)return null;
 return <details><summary>Correct demand observation</summary><p>Current score: {record.actual_demand??'Not recorded'}. Leave blank to withdraw an incorrect observation.</p><form className="account-form" onSubmit={submit}><label>Corrected demand score<input className="input" type="number" name="score" min={0} max={100} step="any" defaultValue={record.actual_demand??''}/></label><label>Reason for correction<input className="input" name="reason" minLength={5} maxLength={1000} required/></label><button className="btn" disabled={busy}>Record correction</button></form>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</details>;
}
