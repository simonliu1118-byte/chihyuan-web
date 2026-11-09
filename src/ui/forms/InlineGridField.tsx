import "./inline-grid-field.css";

/** Column names above compact optional values; keeps the entry state in the owning record form. */
export function InlineGridField({label,cells,disabled=false,onChange}:{
 label:string;cells:readonly {id:number;label:string;value:string}[];disabled?:boolean;
 onChange:(id:number,value:string)=>void;
}) {
 return <div role="group" className="cy-inline-grid-field" aria-label={label}>
  {cells.map(cell=><div className="cy-inline-grid-field-cell" key={cell.id}>
   <span title={cell.label}>{cell.label}</span>
   <input className="cy-op-input" type="text" inputMode="decimal" aria-label={cell.label+"價格"}
     value={cell.value} disabled={disabled} onChange={e=>onChange(cell.id,e.target.value)} />
  </div>)}
 </div>;
}
