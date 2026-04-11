import{d as h,r as l,A as p}from"./index-HWm1YCFL.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=h("Flag",[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z",key:"i9b6wo"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15",key:"1cm3nv"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=h("Play",[["polygon",{points:"6 3 20 12 6 21 6 3",key:"1oa8hb"}]]),I=15e3,m=15;function A(t,e){if(!t||!e)return Number.POSITIVE_INFINITY;const o=n=>n*Math.PI/180,r=6371e3,c=o(e.lat-t.lat),a=o(e.lng-t.lng),s=o(t.lat),u=o(e.lat),i=Math.sin(c/2)**2+Math.cos(s)*Math.cos(u)*Math.sin(a/2)**2;return 2*r*Math.atan2(Math.sqrt(i),Math.sqrt(1-i))}function R({tripId:t,status:e,token:o}){const r=l.useRef(0),c=l.useRef(null),a=l.useRef(null);l.useEffect(()=>{if(!t||e!=="started"||typeof navigator>"u"||!navigator.geolocation)return;let s=!1;const u=async n=>{if(s)return;const d={lat:n.coords.latitude,lng:n.coords.longitude},f=Date.now(),g=f-r.current,y=A(c.current,d);if(!(g<I&&y<m)){r.current=f,c.current=d;try{await fetch(`${p}/api/driver/trips/${t}/location`,{method:"PATCH",headers:{Authorization:`Bearer ${o}`,"Content-Type":"application/json"},body:JSON.stringify(d)})}catch(M){console.error("Failed to update driver location",M)}}},i=n=>{(n==null?void 0:n.code)===1&&console.warn("Location permission denied for driver tracking.")};return a.current=navigator.geolocation.watchPosition(u,i,{enableHighAccuracy:!0,maximumAge:5e3,timeout:1e4}),()=>{s=!0,a.current!==null&&(navigator.geolocation.clearWatch(a.current),a.current=null)}},[t,e,o])}export{v as F,E as P,R as u};
