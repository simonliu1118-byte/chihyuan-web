/**
 * 「顯示未結案／顯示全部」 switch for a list (門市訂購, 售後維修, 叫貨紀錄). The button names what a
 * click will show next; aria-pressed says the list is showing open records only.
 */
export function OpenOnlyToggle({value,onChange}:{value:boolean;onChange:(openOnly:boolean)=>void}){
 return <button type="button" className="cy-op-button primary" aria-pressed={value} onClick={()=>onChange(!value)}>{value?"顯示全部":"顯示未結案"}</button>;
}
