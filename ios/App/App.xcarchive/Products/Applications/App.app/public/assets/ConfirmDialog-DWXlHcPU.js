import{d as a,j as e}from"./index-HWm1YCFL.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=a("CircleCheckBig",[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=a("TriangleAlert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);function x({open:s,title:i="Confirm action",message:l="Are you sure?",confirmText:r="Confirm",cancelText:c="Cancel",danger:t=!1,onConfirm:o,onCancel:n}){return s?e.jsx("div",{style:{position:"fixed",inset:0,backgroundColor:"rgba(0, 0, 0, 0.7)",zIndex:1e4,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"},onClick:n,children:e.jsxs("div",{className:"glass-panel animate-in",style:{width:"100%",maxWidth:420},onClick:d=>d.stopPropagation(),children:[e.jsxs("h3",{className:"mb-3",style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx(p,{size:18,style:{color:t?"var(--accent-red)":"var(--accent-amber)"}}),i]}),e.jsx("p",{style:{color:"var(--text-secondary)",fontSize:"0.9rem",marginBottom:16},children:l}),e.jsxs("div",{className:"flex gap-2",style:{justifyContent:"flex-end"},children:[e.jsx("button",{className:"btn btn-ghost",onClick:n,children:c}),e.jsx("button",{className:`btn ${t?"btn-danger":"btn-primary"}`,onClick:o,children:r})]})]})}):null}export{x as C,h as a};
