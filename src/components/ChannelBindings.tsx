import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Save } from 'lucide-react';
import { api } from '../lib/api';

type Binding={id:string;channel:'telegram'|'whatsapp'|'web';subject_id:string;unit_id:string;unit_name?:string;is_default:boolean};
type Restaurant={id:string;name:string};

export default function ChannelBindings(){
  const [rows,setRows]=useState<Binding[]>([]);
  const [restaurants,setRestaurants]=useState<Restaurant[]>([]);
  const [open,setOpen]=useState(false);
  const [channel,setChannel]=useState<Binding['channel']>('telegram');
  const [subject,setSubject]=useState('');
  const [unit,setUnit]=useState('');
  const [isDefault,setIsDefault]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const load=async()=>{
    try{
      const [b,c]=await Promise.all([
        api.get<{bindings:Binding[]}>('/api/b2b/bindings'),
        api.get<{restaurants:Restaurant[]}>('/api/b2b/context'),
      ]);
      setRows(b.bindings||[]);
      setRestaurants(c.restaurants||[]);
    }catch(e){setMessage(e instanceof Error?e.message:'Не удалось загрузить связи.')}
  };
  useEffect(()=>{void load()},[]);

  const save=async()=>{
    if(!subject.trim()||!unit)return;
    setBusy(true);setMessage('');
    try{
      await api.post('/api/b2b/bindings',{channel,subject_id:subject.trim(),unit_id:unit,is_default:isDefault});
      setOpen(false);setSubject('');setUnit('');await load();
      setMessage('Связь сохранена и действует на сервере.');
    }catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить связь.')}
    finally{setBusy(false)}
  };

  const remove=async(id:string)=>{
    if(!confirm('Удалить эту связь канала с рестораном?'))return;
    setBusy(true);setMessage('');
    try{await api.delete('/api/b2b/bindings/'+id);await load();setMessage('Связь удалена.')}
    catch(e){setMessage(e instanceof Error?e.message:'Не удалось удалить связь.')}
    finally{setBusy(false)}
  };

  return <section className="panel">
    <div className="workspace-heading">
      <div><span className="eyebrow">КАНАЛЫ · КОНТЕКСТ</span><h2>Связи комнат с ресторанами</h2><p className="muted">Telegram-группа, WhatsApp-номер или веб-контекст привязываются к конкретному ресторану. Это не меняет финансовые данные автоматически.</p></div>
      <button className="primary-button" onClick={()=>{setOpen(true);setMessage('')}}><Plus size={16}/> Добавить связь</button>
    </div>
    {rows.length?<div className="table-wrap"><table className="financial-table"><thead><tr><th>Канал</th><th>Идентификатор комнаты</th><th>Ресторан</th><th>По умолчанию</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><span className="status-chip">{r.channel}</span></td><td className="font-mono">{r.subject_id}</td><td>{r.unit_name||restaurants.find(x=>x.id===r.unit_id)?.name||'—'}</td><td>{r.is_default?'Да':'Нет'}</td><td><button className="icon-button compact" onClick={()=>void remove(r.id)} disabled={busy} aria-label="Удалить связь"><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>:<div className="empty">Связей пока нет. Для Telegram-группы укажите её chat_id и ресторан.</div>}
    {message&&<div className="pnl-message ok">{message}</div>}
    {open&&<div className="modal-backdrop" onMouseDown={e=>e.currentTarget===e.target&&!busy&&setOpen(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="binding-title">
      <button className="modal-close" onClick={()=>setOpen(false)} disabled={busy} aria-label="Закрыть"><X size={18}/></button>
      <small>СВЯЗЬ · КАНАЛ → РЕСТОРАН</small><h2 id="binding-title">Новая связь</h2>
      <label className="settings-field"><span>Канал</span><select value={channel} onChange={e=>setChannel(e.target.value as Binding['channel'])}><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="web">Web</option></select></label>
      <label className="settings-field"><span>Chat ID / номер / идентификатор</span><input autoFocus value={subject} onChange={e=>setSubject(e.target.value)} placeholder={channel==='telegram'?'-100123456789':channel==='whatsapp'?'79991234567':'web'} /></label>
      <label className="settings-field"><span>Ресторан</span><select value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Выберите ресторан</option>{restaurants.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="toggle-row"><span><b>Связь по умолчанию</b><small>Используется, если для канала нет другого уточнения.</small></span><input type="checkbox" checked={isDefault} onChange={e=>setIsDefault(e.target.checked)}/><i/></label>
      <div className="quick-actions"><button className="secondary-button" onClick={()=>setOpen(false)} disabled={busy}>Отмена</button><button className="primary-button" onClick={()=>void save()} disabled={busy||!subject.trim()||!unit}><Save size={16}/>{busy?'Сохраняем…':'Сохранить'}</button></div>
    </section></div>}
  </section>;
}
