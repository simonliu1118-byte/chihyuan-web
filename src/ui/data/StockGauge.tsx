import "./stock-gauge.css";
import type { CSSProperties } from "react";
import { outsourcingProgress } from "../../../shared/outsourcing-flow";

export function StockGauge({quantity,baseline,percentage,tone}:{
  quantity:string;baseline:string;percentage:number|null;tone:"green"|"yellow"|"red";
}){
  const width=percentage==null?100:Math.max(0,Math.min(100,percentage));
  return <div className={"cy-stock-gauge "+tone} role="img"
    aria-label={`庫存 ${quantity}，最近發料後基準 ${baseline}，${percentage==null?"負庫存":percentage+"%"}`}>
    <div className="cy-stock-gauge-track"><span style={{width:width+"%"} as CSSProperties}/></div>
    <strong>{percentage==null?"—":percentage+"%"}</strong>
  </div>;
}

export function ProductionGauge({planned,delivered}:{planned:number;delivered:number}){
  const percentage=outsourcingProgress(planned,delivered);
  return <div className="cy-stock-gauge production" aria-label={`交貨進度 ${percentage}%`}>
    <div className="cy-stock-gauge-track"><span style={{width:percentage+"%"}}/></div>
    <strong>{percentage}%</strong>
  </div>;
}
