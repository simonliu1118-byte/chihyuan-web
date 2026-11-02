import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Render the actual shared components as an element tree. Native modal/focus behavior
// is additionally checked in the browser; these tests exercise their public actions.
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: { contents: 'export {Dialog,Drawer,BottomSheet} from "./src/ui/overlays/Dialog"; export {ConfirmDialog} from "./src/ui/overlays/ConfirmDialog";', resolveDir: root, loader: "tsx" },
  bundle: true, format: "esm", platform: "node", write: false, jsx: "automatic",
  plugins: [{ name: "element-tree", setup(b) {
    b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, () => ({ path: "react", namespace: "tree" }));
    b.onLoad({ filter: /.*/, namespace: "tree" }, () => ({ contents: 'export const useLayoutEffect=()=>{};export const useId=()=>"test-dialog-title";export const useRef=()=>({current:null});export const jsx=(type,props)=>({type,props:props||{}});export const jsxs=jsx;export const Fragment="fragment";' }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
  } }],
});
const { Dialog, Drawer, BottomSheet, ConfirmDialog } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
function nodes(value) {
  if (value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value.type === "function") return nodes(value.type(value.props));
  return [value, ...nodes(value.props.children)];
}
const text = value => value == null ? "" : typeof value !== "object" ? String(value)
  : Array.isArray(value) ? value.map(text).join("") : text(value.props.children);
const button = (all, label) => all.find(n => n.type === "button" && (n.props["aria-label"] === label || text(n) === label));

test("modal, drawer and sheet ignore surrounding clicks while explicit close and Escape remain usable", () => {
  for (const Component of [Dialog, Drawer, BottomSheet]) {
    let closes = 0;
    const all = nodes(Component({ open: true, title: "查看紀錄", onClose: () => closes++ }));
    const dialog = all.find(n => n.type === "dialog");
    dialog.props.onClick?.({ target: dialog, currentTarget: dialog });
    dialog.props.onClick?.({ target: {}, currentTarget: dialog });
    assert.equal(closes, 0);
    button(all, "關閉").props.onClick();
    assert.equal(closes, 1);
    let prevented = false;
    dialog.props.onCancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(closes, 2);
  }
});

test("hiding either header X preserves the form, cancel action and draft until explicit cancellation", () => {
  for (const hideHeader of [false, true]) {
    let draft = "尚未儲存的內容";
    const cancel = () => { draft = ""; };
    const all = nodes(Dialog({ open: true, title: "修改", showCloseButton: false, hideHeader, onClose: cancel,
      children: { type: "input", props: { value: draft } },
      footer: { type: "button", props: { children: "取消", onClick: cancel } },
    }));
    const dialog = all.find(n => n.type === "dialog");
    dialog.props.onClick?.({ target: dialog, currentTarget: dialog });
    assert.equal(draft, "尚未儲存的內容");
    assert.equal(all.find(n => n.type === "input").props.value, draft);
    assert.equal(button(all, "關閉"), undefined);
    button(all, "取消").props.onClick();
    assert.equal(draft, "");
  }
});

test("shared confirmations have one cancel route and retain busy non-dismissal", () => {
  for (const busy of [false, true]) {
    let cancels = 0;
    const all = nodes(ConfirmDialog({ open: true, title: "確認操作", busy, onConfirm() {}, onCancel: () => cancels++ }));
    const dialog = all.find(n => n.type === "dialog");
    assert.equal(button(all, "關閉"), undefined);
    assert.equal(button(all, "取消").props.disabled, busy);
    dialog.props.onClick?.({ target: dialog, currentTarget: dialog });
    assert.equal(cancels, 0);
    dialog.props.onCancel({ preventDefault() {} });
    assert.equal(cancels, busy ? 0 : 1);
  }
});
