"use client";

import Link from "next/link";
import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { readJsonSafe } from "@/lib/fetchJson";
import styles from "./cleanup.module.css";

type Entity = "orders" | "projects";
type OrderRow = { id:string; parentOrderId:string|null; projectId:string|null; status:string; source:"GREENWICH_INTERNAL"|"WOWSTORG_EXTERNAL"; startDate:string; endDate:string; customerName:string; eventName:string|null; totalAmount:number };
type ProjectRow = { id:string; title:string; customerName:string|null; ownerName:string; updatedAt:string; archivedAt:string|null; ordersCount:number; filesCount:number; tasksCount:number };
type OrderPreview = { totalOrdersToDelete:number; rootOrdersToDelete:number; quickSupplementsToDelete:number; linesCount:number; returnSplitsCount:number; incidentsCount:number; remindersCount:number; blockingProjectLinkedOrders:Array<{id:string}> };
type ProjectPreview = { projectsCount:number; ordersToDetachCount:number; tasksToDetachCount:number; filesCount:number; filesSizeBytes:number; estimateVersionsCount:number; estimateSectionsCount:number; contactsCount:number; activityLogsCount:number; workspaceItemsCount:number; nonCompletedProjects:Array<{id:string}> };

const ORDER_STATUSES = [["SUBMITTED","Новая"],["ESTIMATE_SENT","Смета"],["CHANGES_REQUESTED","Правки"],["APPROVED_BY_GREENWICH","Согласовано"],["PICKING","Сборка"],["ISSUED","Выдано"],["RETURN_DECLARED","Приёмка"],["CLOSED","Закрыто"],["CANCELLED","Отменено"]] as const;
const STATUS_LABEL = Object.fromEntries(ORDER_STATUSES);
const formatDate = (iso:string) => new Date(iso).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"});
const formatBytes = (value:number) => value < 1048576 ? `${Math.round(value/1024)} КБ` : `${(value/1048576).toFixed(1)} МБ`;

export default function AdminCleanupPage(){
  const {state}=useAuth();
  const forbidden=state.status==="authenticated"&&state.user.role!=="WOWSTORG";
  const [entity,setEntity]=React.useState<Entity>("orders");
  const [orders,setOrders]=React.useState<OrderRow[]>([]);
  const [projects,setProjects]=React.useState<ProjectRow[]>([]);
  const [orderPreview,setOrderPreview]=React.useState<OrderPreview|null>(null);
  const [projectPreview,setProjectPreview]=React.useState<ProjectPreview|null>(null);
  const [selected,setSelected]=React.useState<Set<string>>(new Set());
  const [queryInput,setQueryInput]=React.useState("");
  const [query,setQuery]=React.useState("");
  const [source,setSource]=React.useState("all");
  const [sort,setSort]=React.useState("readyBy_asc");
  const [statuses,setStatuses]=React.useState<Set<string>>(new Set(ORDER_STATUSES.map(([value])=>value)));
  const [showStatuses,setShowStatuses]=React.useState(false);
  const [confirmation,setConfirmation]=React.useState("");
  const [loading,setLoading]=React.useState(true);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState<string|null>(null);
  const [success,setSuccess]=React.useState<string|null>(null);

  React.useEffect(()=>{const timer=window.setTimeout(()=>setQuery(queryInput.trim()),250);return()=>window.clearTimeout(timer)},[queryInput]);
  const ids=React.useMemo(()=>[...selected].sort(),[selected]);
  const idsKey=ids.join(",");
  const load=React.useCallback(async()=>{
    setLoading(true);setError(null);
    const params=new URLSearchParams({entity,sort});
    if(query)params.set("q",query);if(idsKey)params.set("selected",idsKey);
    if(entity==="orders"){if(source!=="all")params.set("source",source);params.set("status",[...statuses].join(","));}
    try{
      const response=await fetch(`/api/admin/order-cleanup?${params}`,{cache:"no-store"});
      const data=await readJsonSafe<{orders?:OrderRow[];projects?:ProjectRow[];preview?:OrderPreview|ProjectPreview|null;error?:{message?:string}}>(response);
      if(!response.ok)throw new Error(data?.error?.message??"Не удалось загрузить данные");
      if(entity==="orders"){setOrders(data?.orders??[]);setOrderPreview((data?.preview as OrderPreview|null)??null)}else{setProjects(data?.projects??[]);setProjectPreview((data?.preview as ProjectPreview|null)??null)}
    }catch(cause){setError(cause instanceof Error?cause.message:"Ошибка сети или сервера")}finally{setLoading(false)}
  },[entity,idsKey,query,sort,source,statuses]);
  React.useEffect(()=>{if(!forbidden)void load()},[forbidden,load]);

  function changeEntity(next:Entity){setEntity(next);setSelected(new Set());setConfirmation("");setSuccess(null);setError(null);setSort(next==="orders"?"readyBy_asc":"updated_desc")}
  function toggle(id:string){setSuccess(null);setConfirmation("");setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function selectVisible(){setSelected(new Set((entity==="orders"?orders:projects).map(row=>row.id)));setConfirmation("");setSuccess(null)}
  function clearSelection(){setSelected(new Set());setConfirmation("");setSuccess(null)}
  const orderBlocked=Boolean(orderPreview?.blockingProjectLinkedOrders.length);
  const projectBlocked=Boolean(projectPreview?.nonCompletedProjects.length);
  const canDelete=selected.size>0&&confirmation==="DELETE"&&!orderBlocked&&!projectBlocked&&!busy;
  async function deleteSelected(){
    if(!canDelete)return;setBusy(true);setError(null);setSuccess(null);
    try{
      const response=await fetch("/api/admin/order-cleanup/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(entity==="orders"?{entity,orderIds:ids,confirmation}:{entity,projectIds:ids,confirmation})});
      const data=await readJsonSafe<Record<string,number>&{error?:{message?:string}}>(response);if(!response.ok)throw new Error(data?.error?.message??"Удаление не выполнено");
      setSuccess(entity==="orders"?`Удалено заявок: ${data?.deletedOrderCount??0}.`:`Удалено проектов: ${data?.deletedProjectCount??0}. Заявок отвязано: ${data?.detachedOrdersCount??0}.`);setSelected(new Set());setConfirmation("");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Ошибка сети или сервера")}finally{setBusy(false)}
  }
  const rows=entity==="orders"?orders:projects;

  return <AppShell title="Админка · Очистка">{forbidden?<p>Этот раздел доступен только сотрудникам ВАУСТОРГ.</p>:
    <main className={styles.workspace}>
      <Link href="/admin" className={styles.back}>← Администрирование</Link>
      <header className={styles.hero}><div><span className={styles.eyebrow}>Служебный инструмент</span><h2>Очистка данных</h2><p>Удаление тестовых и больше не нужных сущностей с обязательным предпросмотром связей.</p></div><span className={styles.dangerBadge}>Безвозвратно</span></header>
      <nav className={styles.tabs} aria-label="Тип данных">
        <button type="button" className={entity==="orders"?styles.activeTab:""} onClick={()=>changeEntity("orders")}><strong>Заявки</strong><span>Основные и дополнительные</span></button>
        <button type="button" className={entity==="projects"?styles.activeTab:""} onClick={()=>changeEntity("projects")}><strong>Проекты</strong><span>Только завершённые</span></button>
      </nav>
      <section className={styles.panel} aria-labelledby="cleanup-filters">
        <div className={styles.panelHeading}><div><h3 id="cleanup-filters">Найти и выбрать</h3><p>{entity==="orders"?"Связанные с проектом заявки защищены от удаления.":"Активные и отменённые проекты в этот список не попадают."}</p></div></div>
        <div className={styles.filters}>
          <label><span>Поиск</span><input type="search" value={queryInput} onChange={event=>setQueryInput(event.target.value)} placeholder={entity==="orders"?"Заказчик, мероприятие, ID":"Проект, заказчик, ответственный, ID"}/></label>
          {entity==="orders"?<label><span>Источник</span><select value={source} onChange={event=>setSource(event.target.value)}><option value="all">Все источники</option><option value="GREENWICH_INTERNAL">Grinvich</option><option value="WOWSTORG_EXTERNAL">Внешние</option></select></label>:null}
          <label><span>Сортировка</span><select value={sort} onChange={event=>setSort(event.target.value)}>{entity==="orders"?<><option value="readyBy_asc">Сначала ближайшие</option><option value="created_desc">Сначала новые</option><option value="created_asc">Сначала старые</option></>:<><option value="updated_desc">Недавно завершённые</option><option value="updated_asc">Давно завершённые</option><option value="created_desc">Сначала новые</option><option value="title_asc">По названию</option></>}</select></label>
        </div>
        {entity==="orders"?<div className={styles.statusFilter}><button type="button" onClick={()=>setShowStatuses(value=>!value)}>{showStatuses?"Скрыть статусы":`Статусы · ${statuses.size}`}</button>{showStatuses?<div>{ORDER_STATUSES.map(([value,label])=><label key={value}><input type="checkbox" checked={statuses.has(value)} onChange={()=>setStatuses(current=>{const next=new Set(current);if(next.has(value)&&next.size>1)next.delete(value);else next.add(value);return next})}/>{label}</label>)}</div>:null}</div>:null}
      </section>
      <section className={styles.panel} aria-labelledby="cleanup-list">
        <div className={styles.panelHeading}><div><h3 id="cleanup-list">{entity==="orders"?"Заявки":"Завершённые проекты"}</h3><p>Найдено: {rows.length} · выбрано: {selected.size}</p></div><div className={styles.listActions}><button type="button" onClick={selectVisible}>Выбрать видимые</button><button type="button" onClick={clearSelection}>Сбросить</button></div></div>
        {loading?<div className={styles.empty}>Загрузка…</div>:error&&!rows.length?<div className={styles.error}>{error}</div>:!rows.length?<div className={styles.empty}>По текущим фильтрам ничего не найдено.</div>:
          <div className={styles.rows}>{entity==="orders"?orders.map(order=><label key={order.id} className={`${styles.row} ${selected.has(order.id)?styles.selected:""}`}><input type="checkbox" checked={selected.has(order.id)} onChange={()=>toggle(order.id)}/><div className={styles.rowMain}><div className={styles.rowTitle}><strong>{order.eventName||order.customerName}</strong><span>{STATUS_LABEL[order.status]??order.status}</span>{order.projectId?<em>Связан с проектом</em>:null}</div><p>{order.customerName} · {formatDate(order.startDate)} — {formatDate(order.endDate)} · {order.totalAmount.toLocaleString("ru-RU")} ₽</p></div><Link href={`/orders/${order.id}`} onClick={event=>event.stopPropagation()}>Открыть ↗</Link></label>):projects.map(project=><label key={project.id} className={`${styles.row} ${selected.has(project.id)?styles.selected:""}`}><input type="checkbox" checked={selected.has(project.id)} onChange={()=>toggle(project.id)}/><div className={styles.rowMain}><div className={styles.rowTitle}><strong>{project.title}</strong><span>Завершён</span>{project.archivedAt?<em>В архиве</em>:null}</div><p>{project.customerName||"Заказчик не указан"} · {project.ownerName} · обновлён {formatDate(project.updatedAt)}</p><small>{project.ordersCount} заявок · {project.tasksCount} задач · {project.filesCount} файлов</small></div><Link href={`/projects/${project.id}`} onClick={event=>event.stopPropagation()}>Открыть ↗</Link></label>)}</div>}
      </section>
      <section className={styles.deletePanel} aria-labelledby="cleanup-preview">
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Последняя проверка</span><h3 id="cleanup-preview">Что будет удалено</h3><p>Сначала проверь состав. Заявки и задачи удаляемого проекта сохраняются и только отвязываются.</p></div></div>
        {entity==="orders"?<OrderPreviewView preview={orderPreview}/>:<ProjectPreviewView preview={projectPreview}/>}
        {orderBlocked?<div className={styles.warning}>В выборе есть заявки, связанные с проектами. Удали сам проект или сначала отвяжи заявки.</div>:null}{projectBlocked?<div className={styles.warning}>Статус выбранного проекта изменился. Обнови список перед удалением.</div>:null}{success?<div className={styles.success}>{success}</div>:null}{error&&rows.length?<div className={styles.error}>{error}</div>:null}
        <div className={styles.confirm}><label><span>Для подтверждения введи DELETE</span><input value={confirmation} onChange={event=>setConfirmation(event.target.value)} placeholder="DELETE"/></label><button type="button" disabled={!canDelete} onClick={()=>void deleteSelected()}>{busy?"Удаляем…":`Удалить ${entity==="orders"?"заявки":"проекты"}`}</button></div>
      </section>
    </main>}</AppShell>
}
function Metrics({items}:{items:Array<[string,React.ReactNode]>}){return <div className={styles.metrics}>{items.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
function OrderPreviewView({preview}:{preview:OrderPreview|null}){return preview?<Metrics items={[["Всего заявок",preview.totalOrdersToDelete],["Основных / доп.",`${preview.rootOrdersToDelete} / ${preview.quickSupplementsToDelete}`],["Строк",preview.linesCount],["Инцидентов",preview.incidentsCount],["Возвратов",preview.returnSplitsCount],["Напоминаний",preview.remindersCount]]}/>:<div className={styles.empty}>Выбери заявки — здесь появится точный объём удаления.</div>}
function ProjectPreviewView({preview}:{preview:ProjectPreview|null}){return preview?<Metrics items={[["Проектов",preview.projectsCount],["Заявок останется",preview.ordersToDetachCount],["Задач останется",preview.tasksToDetachCount],["Файлов",`${preview.filesCount} · ${formatBytes(preview.filesSizeBytes)}`],["Смет / разделов",`${preview.estimateVersionsCount} / ${preview.estimateSectionsCount}`],["Контактов",preview.contactsCount],["Событий",preview.activityLogsCount],["Элементов доски",preview.workspaceItemsCount]]}/>:<div className={styles.empty}>Выбери завершённые проекты — здесь появится точный объём удаления.</div>}
