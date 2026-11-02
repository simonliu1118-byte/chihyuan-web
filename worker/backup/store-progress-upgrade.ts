export const STORE_NO_HOLD_SCHEMAS=["f9d12f6b7a6065e9b546e72373436cbdcec892d9b44327f479cba34423cdc8c9","13895fad7e67cf414b3830a5ea99d592bff1c3d35be9eace14fb5d73f4ca0964"];
// 0042 adds only contact indexes: same columns as no-hold, so a no-hold backup restores unchanged. LF/CRLF layouts.
export const STORE_REPAIR_SCHEMAS=["b3f9f2a9e256ca168a2811dafba00c69cdbcd030e91251b32b80a46910086b55"]; // 0043 exact LF; CRLF variant recorded after CI schema check.
export const STORE_CONTACT_INDEX_SCHEMAS=["8501f8368055f0915882ec395e33d446c3d5b43398a4c095578c113072009332","2a5f15d27c656bcb50dcced068f75c9b124e4f38db2d3d235b76004f295f26a9"];
// Exact pre-0035 schema/column layouts. Do not generalize unknown-schema restore acceptance.
export const STORE_BLACKLIST_LIFECYCLE_SCHEMAS=["59ea5b424bbf24cc50e96f4acc97be730294d35cc26b3552ea7fbb8b0c7f0f9c","aac36cf06e7d0847c60646cd83cafb91b2b6b1481540a4dcd397b037e01227c9","fe569f82713a861f701b0f96b5436edb04953ff03292cdee18c7ff19dd9a704e"];
export const STORE_ORDER_WORKFLOW_SCHEMAS=["ecb0b9f566d15eb34082dcfb12d858781aec15ee93c343652c4382ad6bd1225b","d997178dc5d7c2f1bc3eaeb29d318de5412d71b3b3be3c591c2a5298a10577fc","6ab0741db696119c36f005fcddb0cebc360987e159b5f6d5dc903dddd73fdbb3"];
export const STORE_BLACKLIST_SCHEMAS=["d96b2f8773cdb6b237390bb198f6ad8ca54a8d95d5aa467cd6582651a3dda710","e115cc0d1eec2b451713cbae3568a827bb2643ea339db1ad4078385f5c2fe0a9","fdb9c540c108c365ccbf134409cd012b3f4e2123cae6ff5eb620177a7a1cc07a"];
export const STORE_SEQUENCE_SCHEMAS=["1f7227750edf4433a5a8a7ff40177d4a6960d7e67ee2dcc21295b9f1e431cc45","e2637afff442e044414ba29532c444ae9d377e4b5be883f1d2020ee7e8af36ba"];
export const STORE_UNORDERABLE_SCHEMAS=["390623f0f81150adf89a83558a3d8935dc9e2b116a77a5566a69d2bc48d7734c","56b90b266bb2456459d32323995211255fb71ca973d4691b0de9bbbcf91fc09c"];
export const STORE_PRE_SEQUENCE_COLUMNS:Record<string,string[]>={store_customer_orders:["call_result","cancel_kind","cancel_reason","created_at","created_by","customer_name","deposit","has_ever_ordered","honorific","id","legacy","line_name","mobile","note","notified_at","notified_date","order_date","ordered_date","phone","picked_up_date","status","updated_at","updated_by","version"]};
export const STORE_MONTHLY_SCHEMAS=["aae0b66db493643c44db312afdfa45b45fdf90d0d094e7b77c6548835ef4e711","84ba2b95d3dab20eeb991ad79dc246ea9feaee0038457a00cf2158440c15bc1f","0e2a0e04167df3caa9bfbde222adafb6dc0df0482f5fae521717c11a4abfd46e"];
export const STORE_PROGRESS_SCHEMAS=["dd6a68b7c31c65be0c1bfc2451ab1a8b4a87eb3db31e31c06df3228af9876f93","44651dd77292aa685c076f9d1e3d13187c1fe9ee4910d09d90ccd05d4ddc2646","11d814ec26979bbde7366e3e07f27cd953bc1363fca58e9bf8c4d4583f861f8e"];
export const STORE_PRE_PROGRESS_COLUMNS:Record<string,string[]>={
 store_customer_orders:["arrived_date","cancel_kind","cancel_reason","created_at","created_by","customer_name","deposit","has_ever_ordered","id","legacy","line_name","mobile","note","notified_at","notified_date","order_date","ordered_date","phone","picked_up_date","status","updated_at","updated_by","version"],
 store_blacklist:["action","active","created_at","created_by","id","line_name","mobile","name","phone","reason","updated_at","updated_by","version"]
};
