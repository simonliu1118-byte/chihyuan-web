// Exact pre-0035 schema/column layouts. Do not generalize unknown-schema restore acceptance.
export const STORE_MONTHLY_SCHEMAS=["aae0b66db493643c44db312afdfa45b45fdf90d0d094e7b77c6548835ef4e711","84ba2b95d3dab20eeb991ad79dc246ea9feaee0038457a00cf2158440c15bc1f","0e2a0e04167df3caa9bfbde222adafb6dc0df0482f5fae521717c11a4abfd46e"];
export const STORE_PROGRESS_SCHEMAS=["dd6a68b7c31c65be0c1bfc2451ab1a8b4a87eb3db31e31c06df3228af9876f93","44651dd77292aa685c076f9d1e3d13187c1fe9ee4910d09d90ccd05d4ddc2646","11d814ec26979bbde7366e3e07f27cd953bc1363fca58e9bf8c4d4583f861f8e"];
export const STORE_PRE_PROGRESS_COLUMNS:Record<string,string[]>={
 store_customer_orders:["arrived_date","cancel_kind","cancel_reason","created_at","created_by","customer_name","deposit","has_ever_ordered","id","legacy","line_name","mobile","note","notified_at","notified_date","order_date","ordered_date","phone","picked_up_date","status","updated_at","updated_by","version"],
 store_blacklist:["action","active","created_at","created_by","id","line_name","mobile","name","phone","reason","updated_at","updated_by","version"]
};
