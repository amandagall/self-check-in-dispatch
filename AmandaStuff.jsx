import { useState, useMemo, useRef } from "react";

const C = {
  teal:      "#1a7a7a", tealLight:   "#e8f4f4",
  purple:    "#5b3a7a", purpleLight: "#f0ebf7",
  berry:     "#8b3a52", berryLight:  "#f7ebee",
  gold:      "#b8952a", goldLight:   "#faf4e6",
  forest:    "#2a5a3a", forestLight: "#e8f2eb",
  ink:       "#0f1a1a", white:       "#ffffff",
  offwhite:  "#f9f9f7", rule:        "#e8e8e4",
  muted:     "#8a8a82", headerBg:    "#0d1f1f",
};
const JEWELS = [C.teal, C.purple, C.berry, C.gold, C.forest];

const DEFAULT_CATEGORIES = [
  "Electronics","Furniture","Appliances","Clothing","Jewelry",
  "Art & Collectibles","Tools","Garden","Sports & Outdoor",
  "Kitchen","Books & Media","Other"
];
const CONDITIONS     = ["Mint","Excellent","Good","Fair","Poor"];
const PURCHASE_SOURCES = [
  "Unknown","Retail Store","Online","Amazon","Estate Sale",
  "Thrift / Secondhand","Antique Shop","Marketplace (FB/Craigslist)",
  "Auction","Free — found / donated / gifted","Other"
];
const SENTIMENTAL_LEVELS = [
  { label:"None",          value:0, icon:"",  color:C.muted  },
  { label:"Low",           value:1, icon:"",  color:C.muted  },
  { label:"Medium",        value:2, icon:"",  color:C.muted  },
  { label:"High",          value:3, icon:"★", color:C.gold   },
  { label:"Irreplaceable", value:4, icon:"✦", color:C.berry  },
];
const NEED_LEVELS = [
  { label:"Pure want",    value:0, color:C.berry  },
  { label:"Nice to have", value:1, color:C.gold   },
  { label:"Would use it", value:2, color:C.teal   },
  { label:"Genuine need", value:3, color:C.forest },
];

const SAMPLE_ITEMS = [
  { id:1, name:"KitchenAid Stand Mixer", category:"Kitchen", brand:"KitchenAid",
    isGift:false, giftFrom:"", retailPrice:449, purchasePrice:299, resalePrice:175,
    purchaseYear:2021, condition:"Excellent", purchaseSource:"Online",
    location:"Kitchen counter", warrantyExpires:"2024", tags:["baking","appliance"],
    sentimentalLevel:0, sentimentalNote:"", lastUsed:"2026-05",
    notes:"Artisan 5qt, Empire Red", photos:[], maintenanceNote:"", forSale:false },
  { id:2, name:"Leather Sectional Sofa", category:"Furniture", brand:"Unknown",
    isGift:false, giftFrom:"", retailPrice:2800, purchasePrice:2800, resalePrice:800,
    purchaseYear:2019, condition:"Good", purchaseSource:"Retail Store",
    location:"Living room", warrantyExpires:"N/A", tags:["living room"],
    sentimentalLevel:0, sentimentalNote:"", lastUsed:"2024-01",
    notes:"Dark brown, 3-piece", photos:[], maintenanceNote:"", forSale:false },
  { id:3, name:"Grandmother's Quilt", category:"Art & Collectibles", brand:"Unknown",
    isGift:true, giftFrom:"Grandma Rose", retailPrice:300, purchasePrice:0, resalePrice:0,
    purchaseYear:2010, condition:"Excellent", purchaseSource:"Free — found / donated / gifted",
    location:"Bedroom chest", warrantyExpires:"None", tags:["heirloom","textile"],
    sentimentalLevel:4, sentimentalNote:"Handmade by grandma. Every square is a memory.",
    lastUsed:"", notes:"Hand-stitched, Ohio Star pattern", photos:[], maintenanceNote:"", forSale:false },
  { id:4, name:"Lawn Mower", category:"Garden", brand:"Honda",
    isGift:false, giftFrom:"", retailPrice:650, purchasePrice:550, resalePrice:200,
    purchaseYear:2020, condition:"Good", purchaseSource:"Retail Store",
    location:"Garage", warrantyExpires:"2023", tags:["garden","outdoor"],
    sentimentalLevel:0, sentimentalNote:"", lastUsed:"2026-05",
    notes:"Self-propelled", photos:[],
    maintenanceNote:"Sharpen blade & oil annually — due every spring", forSale:false },
];

const SAMPLE_WISHLIST = [
  { id:101, name:"New Oven", category:"Appliances", estimatedCost:1800,
    needLevel:0, notes:"Want a double oven. Current one works fine.", tags:["kitchen"], addedYear:2026 },
  { id:102, name:"Outdoor Sectional", category:"Furniture", estimatedCost:2200,
    needLevel:1, notes:"For the back deck once it's done.", tags:["garden","outdoor"], addedYear:2026 },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function conditionColor(c) {
  return { Mint:C.teal, Excellent:C.forest, Good:C.gold, Fair:C.berry, Poor:"#c0392b" }[c] || C.muted;
}
function estimatedValue(item) {
  const age = new Date().getFullYear() - item.purchaseYear;
  const cm  = { Mint:0.95, Excellent:0.80, Good:0.60, Fair:0.35, Poor:0.15 }[item.condition] || 0.5;
  return Math.round(item.retailPrice * cm * Math.max(0.1, 1 - age * 0.07));
}
function fmt(n) { return "$" + Number(n||0).toLocaleString(); }
function isUnused(item) {
  if (!item.lastUsed) return false;
  const [y,m] = item.lastUsed.split("-").map(Number);
  const now   = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) > 11;
}

function generateListing(item) {
  const est  = estimatedValue(item);
  const age  = new Date().getFullYear() - item.purchaseYear;
  const price = item.resalePrice > 0 ? fmt(item.resalePrice) : fmt(Math.round(est * 0.85));
  const brand = item.brand && item.brand !== "Unknown" ? `${item.brand} ` : "";
  const lines = [
    `🛒 FOR SALE — ${brand}${item.name}`,
    ``,
    `💰 Asking: ${price}`,
    `📦 Condition: ${item.condition}`,
    `📅 Age: ${age} year${age !== 1 ? "s" : ""} old`,
    item.location ? `📍 Located: ${item.location}` : null,
    ``,
    item.notes ? `Details: ${item.notes}` : null,
    item.retailPrice ? `Retail new: ${fmt(item.retailPrice)}` : null,
    ``,
    `Cash or e-transfer. Local pickup preferred.`,
    `DM to arrange — serious inquiries only please.`,
    ``,
    (item.tags||[]).length > 0 ? (item.tags.map(t => `#${t.replace(/\s+/g,"")}`).join(" ")) : null,
  ].filter(l => l !== null);
  return lines.join("\n");
}

const emptyItem = {
  name:"", category:DEFAULT_CATEGORIES[0], brand:"", isGift:false, giftFrom:"",
  retailPrice:"", purchasePrice:"", resalePrice:"", purchaseYear:new Date().getFullYear(),
  condition:"Good", purchaseSource:"Unknown", location:"", warrantyExpires:"",
  tags:[], sentimentalLevel:0, sentimentalNote:"", lastUsed:"", notes:"",
  maintenanceNote:"", photos:[], forSale:false
};
const emptyWish = {
  name:"", category:DEFAULT_CATEGORIES[0], estimatedCost:"",
  needLevel:0, notes:"", tags:[], addedYear:new Date().getFullYear()
};

// ── Shared styles ──────────────────────────────────────────────────────────
const inputSt = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"0.85rem",
  background:C.white, border:`1px solid ${C.rule}`, padding:"8px 11px",
  color:C.ink, outline:"none", width:"100%",
};
const smBtnSt = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"0.75rem",
  background:"transparent", border:`1px solid ${C.teal}`, color:C.teal,
  padding:"5px 13px", cursor:"pointer", letterSpacing:"0.05em", whiteSpace:"nowrap",
};
const primaryBtnSt = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"0.78rem",
  fontWeight:600, background:C.teal, color:C.white, border:"none",
  padding:"8px 20px", cursor:"pointer", letterSpacing:"0.06em",
};
const secBtnSt = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"0.78rem",
  background:"transparent", border:`1px solid ${C.rule}`, color:C.muted,
  padding:"8px 16px", cursor:"pointer",
};
const sellBtnSt = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"0.75rem",
  fontWeight:600, background:"transparent", border:`1px solid ${C.gold}`,
  color:C.gold, padding:"5px 13px", cursor:"pointer", letterSpacing:"0.05em", whiteSpace:"nowrap",
};

const overlayS = {
  position:"fixed", inset:0, background:"rgba(15,26,26,0.55)",
  display:"flex", alignItems:"center", justifyContent:"center", zIndex:100,
};
const modalS = {
  background:C.white, width:"100%", maxWidth:580, maxHeight:"93vh",
  overflowY:"auto", padding:"32px 30px 26px",
};
const modalTitleS = {
  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize:"1.05rem",
  fontWeight:700, letterSpacing:"0.03em", marginBottom:20, color:C.ink,
};

function Pill({ label, color }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      border:`1px solid ${color}`, color,
      padding:"2px 9px", fontSize:"0.63rem", fontWeight:600,
      letterSpacing:"0.07em", textTransform:"uppercase", borderRadius:2, whiteSpace:"nowrap",
    }}>{label}</span>
  );
}
function SentBadge({ level }) {
  const s = SENTIMENTAL_LEVELS[level];
  if (!s || level < 3) return null;
  return <Pill label={`${s.icon} ${s.label}`} color={s.color} />;
}
function GiftBadge({ from }) {
  return <Pill label={from ? `Gift · ${from}` : "Gift"} color={C.purple} />;
}
function FieldLabel({ children, optional }) {
  return (
    <div style={{ fontSize:"0.62rem", textTransform:"uppercase", letterSpacing:"0.12em", color:C.muted, marginBottom:4, fontWeight:600 }}>
      {children}{optional && <span style={{ fontWeight:400, textTransform:"none", marginLeft:5, color:"#ccc" }}>(optional)</span>}
    </div>
  );
}
function Divider() { return <div style={{ borderTop:`1px solid ${C.rule}`, margin:"14px 0" }} />; }
function SecHead({ children }) {
  return <div style={{ fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.14em", color:C.muted, fontWeight:700, marginBottom:9 }}>{children}</div>;
}

// ── Photo Strip ────────────────────────────────────────────────────────────
function PhotoStrip({ photos, onAdd, onRemove, editable }) {
  const ref = useRef();
  function handleFiles(e) {
    const files = Array.from(e.target.files).slice(0, 5 - photos.length);
    files.forEach(f => { const r = new FileReader(); r.onload = ev => onAdd(ev.target.result); r.readAsDataURL(f); });
    e.target.value = "";
  }
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
      {photos.map((src,i) => (
        <div key={i} style={{ position:"relative" }}>
          <img src={src} alt="" style={{ width:80, height:80, objectFit:"cover", border:`1px solid ${C.rule}`, display:"block" }} />
          {i === 0 && <span style={{ position:"absolute", bottom:0, left:0, background:C.teal, color:"#fff", fontSize:"0.5rem", padding:"1px 5px", letterSpacing:"0.06em" }}>HERO</span>}
          {editable && <button onClick={() => onRemove(i)} style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", width:18, height:18, cursor:"pointer", fontSize:"0.62rem", borderRadius:1 }}>✕</button>}
        </div>
      ))}
      {editable && photos.length < 5 && (
        <button onClick={() => ref.current.click()} style={{ width:80, height:80, border:`1.5px dashed ${C.rule}`, background:"transparent", cursor:"pointer", color:C.muted, fontSize:"0.68rem", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3 }}>
          <span style={{ fontSize:"1.1rem", color:C.teal }}>+</span>
          <span>photo</span>
          <input ref={ref} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={handleFiles} />
        </button>
      )}
    </div>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────────
function TagInput({ tags, setTags }) {
  const [val, setVal] = useState("");
  function add() { const v=val.trim().toLowerCase(); if(v&&!tags.includes(v)) setTags([...tags,v]); setVal(""); }
  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:6 }}>
        <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add tag…" style={inputSt} />
        <button onClick={add} style={smBtnSt}>Add</button>
      </div>
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {tags.map(t => (
          <span key={t} style={{ background:C.offwhite, border:`1px solid ${C.rule}`, padding:"2px 8px", fontSize:"0.7rem", color:C.muted, display:"inline-flex", alignItems:"center", gap:4 }}>
            {t} <span onClick={()=>setTags(tags.filter(x=>x!==t))} style={{ cursor:"pointer", color:C.berry, fontSize:"0.65rem" }}>✕</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Sell Listing Modal ─────────────────────────────────────────────────────
function SellModal({ item, onClose, onConfirmSale }) {
  const listing = generateListing(item);
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(listing).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  }
  return (
    <div style={overlayS} onClick={onClose}>
      <div style={{ ...modalS, maxWidth:520 }} onClick={e=>e.stopPropagation()}>
        <div style={modalTitleS}>FB Marketplace Listing</div>
        <div style={{ fontSize:"0.72rem", color:C.muted, marginBottom:14 }}>
          Copy and paste this into Facebook Marketplace. Edit as needed before posting.
        </div>
        <textarea readOnly value={listing} style={{
          ...inputSt, minHeight:280, resize:"vertical", background:C.offwhite,
          fontSize:"0.82rem", lineHeight:1.65, fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",
        }} />
        <div style={{ display:"flex", gap:9, justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
          <button onClick={onConfirmSale} style={{ ...primaryBtnSt, background:C.gold, fontSize:"0.75rem" }}>
            ✓ Mark as Currently Selling
          </button>
          <div style={{ display:"flex", gap:8 }}>
            <button style={secBtnSt} onClick={onClose}>Close</button>
            <button style={{ ...primaryBtnSt, background: copied ? C.forest : C.teal }} onClick={copy}>
              {copied ? "✓ Copied!" : "Copy Listing"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category Manager ───────────────────────────────────────────────────────
function CategoryManager({ categories, onClose, onSave }) {
  const [cats, setCats] = useState([...categories]);
  const [nv, setNv] = useState("");
  function add() { const v=nv.trim(); if(v&&!cats.includes(v)){setCats([...cats,v]);setNv("");} }
  return (
    <div style={overlayS} onClick={onClose}>
      <div style={{ ...modalS, maxWidth:360 }} onClick={e=>e.stopPropagation()}>
        <div style={modalTitleS}>Manage Categories</div>
        <div style={{ display:"flex", flexDirection:"column", gap:0, marginBottom:14, maxHeight:300, overflowY:"auto" }}>
          {cats.map(c => (
            <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderBottom:`1px solid ${C.rule}` }}>
              <span style={{ fontSize:"0.88rem" }}>{c}</span>
              {DEFAULT_CATEGORIES.includes(c)
                ? <span style={{ fontSize:"0.6rem", color:"#ccc", letterSpacing:"0.08em" }}>DEFAULT</span>
                : <button onClick={()=>setCats(cats.filter(x=>x!==c))} style={{ ...smBtnSt, border:"none", color:C.berry, padding:"2px 6px" }}>Remove</button>}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:7 }}>
          <input value={nv} onChange={e=>setNv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="New category…" style={inputSt} />
          <button onClick={add} style={smBtnSt}>Add</button>
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
          <button style={secBtnSt} onClick={onClose}>Cancel</button>
          <button style={primaryBtnSt} onClick={()=>onSave(cats)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Item Form ──────────────────────────────────────────────────────────────
function ItemForm({ form, setForm, onSave, onClose, categories, editId }) {
  function f(k,v) { setForm(p=>({...p,[k]:v})); }
  const G2 = ({children}) => <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11, marginBottom:12 }}>{children}</div>;
  const G3 = ({children}) => <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:11, marginBottom:12 }}>{children}</div>;
  const Field = ({label, optional, children}) => <div><FieldLabel optional={optional}>{label}</FieldLabel>{children}</div>;
  const Inp = (props) => <input style={inputSt} {...props} />;
  const Sel = ({value,onChange,children}) => <select value={value} onChange={onChange} style={inputSt}>{children}</select>;
  return (
    <div style={overlayS} onClick={onClose}>
      <div style={modalS} onClick={e=>e.stopPropagation()}>
        <div style={modalTitleS}>{editId ? "Edit Item" : "Add Item"}</div>
        <G2>
          <Field label="Item Name *"><Inp placeholder="e.g. Garden Edging" value={form.name} onChange={e=>f("name",e.target.value)} /></Field>
          <Field label="Category"><Sel value={form.category} onChange={e=>f("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</Sel></Field>
        </G2>
        <div style={{ marginBottom:12 }}><Field label="Brand / Manufacturer" optional><Inp placeholder="Unknown" value={form.brand} onChange={e=>f("brand",e.target.value)} /></Field></div>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
          <input type="checkbox" id="ig" checked={form.isGift} onChange={e=>f("isGift",e.target.checked)} />
          <label htmlFor="ig" style={{ fontSize:"0.84rem", cursor:"pointer" }}>This was a gift</label>
        </div>
        {form.isGift && <div style={{ marginBottom:12 }}><Field label="Given by" optional><Inp placeholder="e.g. Mom, Aunt Clara" value={form.giftFrom} onChange={e=>f("giftFrom",e.target.value)} /></Field></div>}
        <G3>
          <Field label="Retail / New *"><Inp type="number" placeholder="0" value={form.retailPrice} onChange={e=>f("retailPrice",e.target.value)} /></Field>
          <Field label={form.isGift?"Est. Gift Value":"What You Paid"}><Inp type="number" placeholder="0" value={form.purchasePrice} onChange={e=>f("purchasePrice",e.target.value)} /></Field>
          <Field label="Resale Value"><Inp type="number" placeholder="0" value={form.resalePrice} onChange={e=>f("resalePrice",e.target.value)} /></Field>
        </G3>
        <G3>
          <Field label="Year Acquired"><Inp type="number" value={form.purchaseYear} onChange={e=>f("purchaseYear",Number(e.target.value))} /></Field>
          <Field label="Condition"><Sel value={form.condition} onChange={e=>f("condition",e.target.value)}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</Sel></Field>
          <Field label="Last Used" optional><Inp type="month" value={form.lastUsed} onChange={e=>f("lastUsed",e.target.value)} /></Field>
        </G3>
        <G2>
          <Field label="Purchase Source"><Sel value={form.purchaseSource} onChange={e=>f("purchaseSource",e.target.value)}>{PURCHASE_SOURCES.map(s=><option key={s}>{s}</option>)}</Sel></Field>
          <Field label="Warranty Expires" optional><Inp placeholder="2026 / None / N/A" value={form.warrantyExpires} onChange={e=>f("warrantyExpires",e.target.value)} /></Field>
        </G2>
        <div style={{ marginBottom:12 }}><Field label="Where Stored" optional><Inp placeholder="Living room, Garage shelf…" value={form.location} onChange={e=>f("location",e.target.value)} /></Field></div>
        <div style={{ marginBottom:12 }}><Field label="Maintenance Reminder" optional><Inp placeholder="e.g. Oil annually — due every spring" value={form.maintenanceNote} onChange={e=>f("maintenanceNote",e.target.value)} /></Field></div>
        <Divider />
        <SecHead>Sentimental Value</SecHead>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          {SENTIMENTAL_LEVELS.map(s => (
            <button key={s.value} onClick={()=>f("sentimentalLevel",s.value)} style={{
              padding:"5px 12px", border:`1px solid ${form.sentimentalLevel===s.value ? s.color : C.rule}`,
              background: form.sentimentalLevel===s.value ? s.color+"18" : "transparent",
              color: form.sentimentalLevel===s.value ? s.color : C.muted,
              fontSize:"0.76rem", cursor:"pointer", fontWeight: form.sentimentalLevel===s.value ? 700 : 400,
              fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",
            }}>{s.icon ? s.icon+" " : ""}{s.label}</button>
          ))}
        </div>
        {form.sentimentalLevel >= 3 && (
          <div style={{ marginBottom:12 }}>
            <FieldLabel>Why it matters</FieldLabel>
            <textarea value={form.sentimentalNote} onChange={e=>f("sentimentalNote",e.target.value)} placeholder="A gift from grandma, reminds me of…" style={{ ...inputSt, minHeight:52, resize:"vertical" }} />
          </div>
        )}
        <Divider />
        <SecHead>Tags</SecHead>
        <div style={{ marginBottom:12 }}><TagInput tags={form.tags||[]} setTags={t=>f("tags",t)} /></div>
        <Divider />
        <SecHead>Photos — first is hero (up to 5)</SecHead>
        <div style={{ marginBottom:12 }}>
          <PhotoStrip photos={form.photos||[]} onAdd={src=>f("photos",[...(form.photos||[]),src])} onRemove={i=>f("photos",(form.photos||[]).filter((_,j)=>j!==i))} editable />
        </div>
        <Divider />
        <FieldLabel>Notes</FieldLabel>
        <textarea value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Color, model, serial number…" style={{ ...inputSt, minHeight:52, resize:"vertical", marginBottom:16 }} />
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}>
          <button style={secBtnSt} onClick={onClose}>Cancel</button>
          <button style={primaryBtnSt} onClick={onSave}>{editId ? "Save Changes" : "Add to Catalog"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Wishlist Form ──────────────────────────────────────────────────────────
function WishForm({ form, setForm, onSave, onClose, categories, editId }) {
  function f(k,v) { setForm(p=>({...p,[k]:v})); }
  return (
    <div style={overlayS} onClick={onClose}>
      <div style={{ ...modalS, maxWidth:460 }} onClick={e=>e.stopPropagation()}>
        <div style={modalTitleS}>{editId ? "Edit Wish" : "Add to Wishlist"}</div>
        <div style={{ marginBottom:12 }}><FieldLabel>Item Name *</FieldLabel><input style={inputSt} placeholder="e.g. New Oven" value={form.name} onChange={e=>f("name",e.target.value)} /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11, marginBottom:12 }}>
          <div><FieldLabel>Category</FieldLabel><select style={inputSt} value={form.category} onChange={e=>f("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><FieldLabel>Est. Cost</FieldLabel><input type="number" style={inputSt} placeholder="0" value={form.estimatedCost} onChange={e=>f("estimatedCost",e.target.value)} /></div>
        </div>
        <div style={{ marginBottom:12 }}>
          <FieldLabel>Do I actually need this?</FieldLabel>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {NEED_LEVELS.map(n => (
              <button key={n.value} onClick={()=>f("needLevel",n.value)} style={{
                padding:"6px 13px", border:`1px solid ${form.needLevel===n.value ? n.color : C.rule}`,
                background: form.needLevel===n.value ? n.color+"18" : "transparent",
                color: form.needLevel===n.value ? n.color : C.muted,
                fontSize:"0.76rem", cursor:"pointer", fontWeight: form.needLevel===n.value ? 700 : 400,
                fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",
              }}>{n.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:12 }}><FieldLabel>Notes</FieldLabel><textarea style={{ ...inputSt, minHeight:60, resize:"vertical" }} placeholder="Why you want it, alternatives considered…" value={form.notes} onChange={e=>f("notes",e.target.value)} /></div>
        <SecHead>Tags</SecHead>
        <div style={{ marginBottom:16 }}><TagInput tags={form.tags||[]} setTags={t=>f("tags",t)} /></div>
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}>
          <button style={secBtnSt} onClick={onClose}>Cancel</button>
          <button style={primaryBtnSt} onClick={onSave}>{editId ? "Save" : "Add to Wishlist"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ items, wishlist }) {
  const totalRetail   = items.reduce((s,i)=>s+Number(i.retailPrice||0),0);
  const totalPaid     = items.reduce((s,i)=>s+Number(i.purchasePrice||0),0);
  const totalEst      = items.reduce((s,i)=>s+estimatedValue(i),0);
  const totalResale   = items.reduce((s,i)=>s+Number(i.resalePrice||0),0);
  const giftsCount    = items.filter(i=>i.isGift).length;
  const irreplaceable = items.filter(i=>i.sentimentalLevel===4).length;
  const maintenance   = items.filter(i=>i.maintenanceNote);
  const sellCandidates= items.filter(i=>isUnused(i)&&Number(i.resalePrice||0)>0&&!i.forSale);
  const wishTotal     = wishlist.reduce((s,i)=>s+Number(i.estimatedCost||0),0);

  const stats = [
    { label:"Items Catalogued", val:items.length,       sub:`${giftsCount} gifts · ${irreplaceable} irreplaceable`, color:C.teal   },
    { label:"Retail Value",     val:fmt(totalRetail),   sub:"if bought new today",                                   color:C.purple },
    { label:"Total Paid",       val:fmt(totalPaid),     sub:`saved ${fmt(totalRetail-totalPaid)}`,                   color:C.forest },
    { label:"Est. Current Value",val:fmt(totalEst),     sub:"age & condition factored",                              color:C.gold   },
    { label:"Resale Total",     val:fmt(totalResale),   sub:"if you sold everything",                                color:C.berry  },
    { label:"Wishlist",         val:fmt(wishTotal),     sub:`${wishlist.length} items you're eyeing`,               color:C.teal   },
  ];

  return (
    <div style={{ padding:"36px 40px" }}>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, marginBottom:44 }}>
        {stats.map((s,i) => (
          <div key={i} style={{
            padding:"24px 22px", border:`1.5px solid ${s.color}`,
            background:C.white, position:"relative",
          }}>
            <div style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.15em", color:s.color, fontWeight:700, marginBottom:10 }}>{s.label}</div>
            <div style={{ fontSize:"1.7rem", fontWeight:700, color:C.ink, letterSpacing:"-0.02em", lineHeight:1, marginBottom:6 }}>{s.val}</div>
            <div style={{ fontSize:"0.72rem", color:C.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
        {/* Maintenance */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <div style={{ width:3, height:18, background:C.gold }} />
            <span style={{ fontSize:"0.72rem", textTransform:"uppercase", letterSpacing:"0.14em", fontWeight:700, color:C.ink }}>Maintenance Reminders</span>
          </div>
          {maintenance.length === 0
            ? <div style={{ fontSize:"0.82rem", color:C.muted, fontStyle:"italic", padding:"16px 0" }}>No maintenance notes yet.</div>
            : maintenance.map(item => (
              <div key={item.id} style={{ padding:"13px 16px", border:`1.5px solid ${C.gold}`, marginBottom:10, background:C.goldLight }}>
                <div style={{ fontSize:"0.85rem", fontWeight:700, color:C.ink, marginBottom:4 }}>{item.name}</div>
                <div style={{ fontSize:"0.76rem", color:C.muted }}>{item.maintenanceNote}</div>
              </div>
            ))
          }
        </div>

        {/* Consider selling */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <div style={{ width:3, height:18, background:C.berry }} />
            <span style={{ fontSize:"0.72rem", textTransform:"uppercase", letterSpacing:"0.14em", fontWeight:700, color:C.ink }}>Consider Selling</span>
          </div>
          {sellCandidates.length === 0
            ? <div style={{ fontSize:"0.82rem", color:C.muted, fontStyle:"italic", padding:"16px 0" }}>Nothing flagged — unused items with resale value appear here.</div>
            : sellCandidates.map(item => (
              <div key={item.id} style={{ padding:"13px 16px", border:`1.5px solid ${C.berry}`, marginBottom:10, background:C.berryLight }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <div style={{ fontSize:"0.85rem", fontWeight:700, color:C.ink }}>{item.name}</div>
                  <div style={{ fontSize:"0.88rem", color:C.berry, fontWeight:700 }}>{fmt(item.resalePrice)}</div>
                </div>
                <div style={{ fontSize:"0.72rem", color:C.muted, marginTop:3 }}>Unused 12+ months · {item.condition} condition</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ── Inventory Page ─────────────────────────────────────────────────────────
function Inventory({ items, setItems, categories, setCategories }) {
  const [showForm, setShowForm]     = useState(false);
  const [showCat, setShowCat]       = useState(false);
  const [showSell, setShowSell]     = useState(null);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(emptyItem);
  const [search, setSearch]         = useState("");
  const [filterCat, setFilterCat]   = useState("All");
  const [sortBy, setSortBy]         = useState("name");
  const [expandedId, setExpandedId] = useState(null);
  const [lightbox, setLightbox]     = useState(null);

  function openAdd()    { setForm({...emptyItem,category:categories[0],photos:[],tags:[]}); setEditId(null); setShowForm(true); }
  function openEdit(it) { setForm({...it,photos:it.photos||[],tags:it.tags||[]}); setEditId(it.id); setShowForm(true); }
  function closeForm()  { setShowForm(false); setEditId(null); }
  function saveItem() {
    if(!form.name||!form.retailPrice) return;
    const c={...form,id:editId||Date.now(),retailPrice:Number(form.retailPrice),purchasePrice:Number(form.purchasePrice)||0,resalePrice:Number(form.resalePrice)||0,sentimentalLevel:Number(form.sentimentalLevel),tags:form.tags||[],photos:form.photos||[]};
    if(editId) setItems(items.map(i=>i.id===editId?c:i)); else setItems([...items,c]);
    closeForm();
  }
  function deleteItem(id) { setItems(items.filter(i=>i.id!==id)); }
  function markForSale(id) {
    setItems(items.map(i=>i.id===id?{...i,forSale:true}:i));
    setShowSell(null);
  }

  const filtered = useMemo(()=>{
    let l=[...items];
    if(filterCat!=="All") l=l.filter(i=>i.category===filterCat);
    if(search){const q=search.toLowerCase();l=l.filter(i=>i.name.toLowerCase().includes(q)||i.brand?.toLowerCase().includes(q)||(i.tags||[]).some(t=>t.includes(q))||i.giftFrom?.toLowerCase().includes(q));}
    l.sort((a,b)=>{
      if(sortBy==="name")        return a.name.localeCompare(b.name);
      if(sortBy==="value")       return estimatedValue(b)-estimatedValue(a);
      if(sortBy==="resale")      return Number(b.resalePrice||0)-Number(a.resalePrice||0);
      if(sortBy==="retail")      return b.retailPrice-a.retailPrice;
      if(sortBy==="year")        return b.purchaseYear-a.purchaseYear;
      if(sortBy==="sentimental") return b.sentimentalLevel-a.sentimentalLevel;
      return 0;
    });
    return l;
  },[items,filterCat,search,sortBy]);

  const yr = new Date().getFullYear();

  return (
    <div>
      {/* Toolbar */}
      <div style={{ padding:"14px 36px", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", borderBottom:`1px solid ${C.rule}` }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, brand, tag…" style={{ ...inputSt, flex:1, minWidth:150 }} />
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={inputSt}>
          <option>All</option>{categories.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={inputSt}>
          <option value="name">Name</option>
          <option value="value">Est. Value</option>
          <option value="resale">Resale</option>
          <option value="retail">Retail</option>
          <option value="year">Year</option>
          <option value="sentimental">Sentimental</option>
        </select>
        <button style={smBtnSt} onClick={()=>setShowCat(true)}>⚙ Categories</button>
        <button style={primaryBtnSt} onClick={openAdd}>+ Add Item</button>
      </div>

      {/* List */}
      <div style={{ padding:"18px 36px", display:"flex", flexDirection:"column", gap:1 }}>
        {filtered.length===0 && <div style={{ textAlign:"center", padding:48, color:C.muted, fontSize:"0.88rem", fontStyle:"italic" }}>No items yet.</div>}
        {filtered.map(item => {
          const est      = estimatedValue(item);
          const expanded = expandedId===item.id;
          const thumb    = item.photos?.[0];
          const age      = yr - item.purchaseYear;
          const savings  = item.retailPrice - item.purchasePrice;

          return (
            <div key={item.id} style={{ background:C.white, border:`1px solid ${item.forSale ? C.gold : C.rule}`, marginBottom:1 }}>
              {/* Row */}
              <div onClick={()=>setExpandedId(expanded?null:item.id)} style={{ display:"grid", gridTemplateColumns:"60px 1fr auto auto auto auto", gap:12, padding:"13px 16px", alignItems:"center", cursor:"pointer" }}>
                <div style={{ width:52, height:52, background:C.offwhite, border:`1px solid ${C.rule}`, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {thumb ? <img src={thumb} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ color:C.rule, fontSize:"1rem" }}>◻</span>}
                </div>
                <div>
                  <div style={{ fontSize:"0.95rem", fontWeight:700, color:C.ink, letterSpacing:"-0.01em" }}>{item.name}</div>
                  <div style={{ fontSize:"0.67rem", color:C.muted, marginTop:3, display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                    <span>{item.category}</span>
                    {item.brand&&item.brand!=="Unknown"&&<span>· {item.brand}</span>}
                    <span>· {item.purchaseYear}</span>
                    {item.isGift && <GiftBadge from={item.giftFrom} />}
                    {item.sentimentalLevel>=3 && <SentBadge level={item.sentimentalLevel} />}
                    {item.forSale && <Pill label="For Sale" color={C.gold} />}
                    {isUnused(item)&&!item.forSale&&<Pill label="Unused 12m+" color={C.berry} />}
                  </div>
                </div>
                <Pill label={item.condition} color={conditionColor(item.condition)} />
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"0.92rem", fontWeight:700, color:C.ink }}>{fmt(est)}</div>
                  <div style={{ fontSize:"0.58rem", textTransform:"uppercase", letterSpacing:"0.09em", color:C.muted }}>est. value</div>
                </div>
                {item.resalePrice>0&&(
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:"0.92rem", fontWeight:700, color:C.teal }}>{fmt(item.resalePrice)}</div>
                    <div style={{ fontSize:"0.58rem", textTransform:"uppercase", letterSpacing:"0.09em", color:C.muted }}>resale</div>
                  </div>
                )}
                <div style={{ color:C.muted, fontSize:"0.7rem" }}>{expanded?"▲":"▼"}</div>
              </div>

              {/* Expanded */}
              {expanded && (
                <div style={{ borderTop:`1px solid ${C.rule}`, padding:"18px 16px 14px", background:C.offwhite }}>
                  {item.resalePrice>0&&(
                    <div style={{ display:"flex", alignItems:"center", gap:16, padding:"10px 14px", borderLeft:`3px solid ${C.teal}`, marginBottom:14, background:C.white }}>
                      <div>
                        <div style={{ fontSize:"0.58rem", textTransform:"uppercase", letterSpacing:"0.12em", color:C.muted }}>Resale Value</div>
                        <div style={{ fontSize:"1.1rem", fontWeight:700, color:C.teal }}>{fmt(item.resalePrice)}</div>
                      </div>
                      <div style={{ fontSize:"0.72rem", color:C.muted, fontStyle:"italic" }}>
                        {Math.round((item.resalePrice/est)*100)}% of estimated current value
                      </div>
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:14 }}>
                    {[
                      ["Retail / New",   fmt(item.retailPrice)],
                      [item.isGift?"Gift Value":"What You Paid", item.isGift?"🎁 Gift":(savings>0?`${fmt(item.purchasePrice)} (saved ${fmt(savings)})`:fmt(item.purchasePrice))],
                      ["Age",            `${age} yr${age!==1?"s":""}`],
                      ["Warranty",       item.warrantyExpires||"—"],
                      ["Stored",         item.location||"—"],
                    ].map(([l,v],i)=>(
                      <div key={i}>
                        <div style={{ fontSize:"0.58rem", textTransform:"uppercase", letterSpacing:"0.12em", color:C.muted, marginBottom:2 }}>{l}</div>
                        <div style={{ fontSize:"0.86rem", fontWeight:600, color:v==="—"?C.rule:C.ink }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:10, fontSize:"0.72rem", color:C.muted }}>
                    {item.purchaseSource&&item.purchaseSource!=="Unknown"&&<span>📦 {item.purchaseSource}</span>}
                    {item.isGift&&item.giftFrom&&<span>🎁 From {item.giftFrom}</span>}
                    {item.brand&&item.brand!=="Unknown"&&<span>🏷 {item.brand}</span>}
                  </div>
                  {item.maintenanceNote&&(
                    <div style={{ padding:"8px 12px", borderLeft:`2px solid ${C.gold}`, background:C.goldLight, marginBottom:10, fontSize:"0.78rem", color:C.ink }}>🔧 {item.maintenanceNote}</div>
                  )}
                  {item.sentimentalLevel>=3&&(
                    <div style={{ marginBottom:10 }}>
                      <SentBadge level={item.sentimentalLevel} />
                      {item.sentimentalNote&&<div style={{ fontSize:"0.78rem", color:C.muted, fontStyle:"italic", marginTop:5 }}>"{item.sentimentalNote}"</div>}
                    </div>
                  )}
                  {(item.tags||[]).length>0&&(
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
                      {item.tags.map(t=><span key={t} style={{ background:C.white, border:`1px solid ${C.rule}`, padding:"2px 8px", fontSize:"0.65rem", color:C.muted }}>{t}</span>)}
                    </div>
                  )}
                  {(item.photos||[]).length>0&&(
                    <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                      {item.photos.map((src,i)=>(
                        <img key={i} src={src} alt="" onClick={e=>{e.stopPropagation();setLightbox(src);}} style={{ width:88, height:88, objectFit:"cover", border:`1px solid ${C.rule}`, cursor:"zoom-in" }} />
                      ))}
                    </div>
                  )}
                  {item.notes&&<div style={{ fontSize:"0.78rem", color:C.muted, fontStyle:"italic", marginBottom:12 }}>"{item.notes}"</div>}
                  <div style={{ display:"flex", gap:7, justifyContent:"flex-end" }}>
                    <button style={smBtnSt} onClick={e=>{e.stopPropagation();openEdit(item);}}>Edit</button>
                    {!item.forSale && (
                      <button style={sellBtnSt} onClick={e=>{e.stopPropagation();setShowSell(item);}}>Sell It</button>
                    )}
                    {item.forSale && (
                      <button style={{...smBtnSt,borderColor:C.muted,color:C.muted}} onClick={e=>{e.stopPropagation();setItems(items.map(i=>i.id===item.id?{...i,forSale:false}:i));}}>Unlist</button>
                    )}
                    <button style={{...smBtnSt,borderColor:C.berry,color:C.berry}} onClick={e=>{e.stopPropagation();deleteItem(item.id);}}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox&&<div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,cursor:"zoom-out" }} onClick={()=>setLightbox(null)}><img src={lightbox} alt="" style={{ maxWidth:"90vw",maxHeight:"90vh",objectFit:"contain" }} /></div>}
      {showCat&&<CategoryManager categories={categories} onClose={()=>setShowCat(false)} onSave={c=>{setCategories(c);setShowCat(false);}} />}
      {showForm&&<ItemForm form={form} setForm={setForm} onSave={saveItem} onClose={closeForm} categories={categories} editId={editId} />}
      {showSell&&<SellModal item={showSell} onClose={()=>setShowSell(null)} onConfirmSale={()=>markForSale(showSell.id)} />}
    </div>
  );
}

// ── Currently Selling Page ─────────────────────────────────────────────────
function CurrentlySelling({ items, setItems }) {
  const [showSell, setShowSell] = useState(null);
  const forSale = items.filter(i=>i.forSale);
  const totalResale = forSale.reduce((s,i)=>s+Number(i.resalePrice||0),0);

  function unlist(id) { setItems(items.map(i=>i.id===id?{...i,forSale:false}:i)); }
  function soldIt(id) { setItems(items.map(i=>i.id===id?{...i,forSale:false,soldDate:new Date().toISOString().slice(0,10)}:i)); }

  return (
    <div style={{ padding:"28px 40px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
        <div style={{ fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.13em", color:C.muted }}>
          {forSale.length} item{forSale.length!==1?"s":""} listed · asking {fmt(totalResale)} total
        </div>
      </div>

      {forSale.length===0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:C.muted }}>
          <div style={{ fontSize:"2rem", marginBottom:12 }}>🛒</div>
          <div style={{ fontSize:"0.9rem", fontStyle:"italic" }}>Nothing listed for sale yet.</div>
          <div style={{ fontSize:"0.78rem", marginTop:6 }}>Hit "Sell It" on any inventory item to get started.</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {forSale.map(item => {
          const est = estimatedValue(item);
          return (
            <div key={item.id} style={{ background:C.white, border:`1.5px solid ${C.gold}`, padding:"18px 20px" }}>
              <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
                {item.photos?.[0] && (
                  <img src={item.photos[0]} alt="" style={{ width:72, height:72, objectFit:"cover", border:`1px solid ${C.rule}`, flexShrink:0 }} />
                )}
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:6 }}>
                    <div style={{ fontSize:"1rem", fontWeight:700, color:C.ink }}>{item.name}</div>
                    <div style={{ fontSize:"1.1rem", fontWeight:700, color:C.gold }}>{item.resalePrice>0?fmt(item.resalePrice):"Price TBD"}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
                    <Pill label={item.condition} color={conditionColor(item.condition)} />
                    <span style={{ fontSize:"0.7rem", color:C.muted }}>{item.category}</span>
                    {item.brand&&item.brand!=="Unknown"&&<span style={{ fontSize:"0.7rem", color:C.muted }}>· {item.brand}</span>}
                    <span style={{ fontSize:"0.7rem", color:C.muted }}>· {new Date().getFullYear()-item.purchaseYear} yrs old</span>
                  </div>
                  {item.notes&&<div style={{ fontSize:"0.78rem", color:C.muted, fontStyle:"italic", marginBottom:10 }}>"{item.notes}"</div>}
                  <div style={{ display:"flex", gap:7 }}>
                    <button style={primaryBtnSt} onClick={()=>setShowSell(item)}>View / Copy Listing</button>
                    <button style={{ ...smBtnSt, borderColor:C.forest, color:C.forest }} onClick={()=>soldIt(item.id)}>✓ Mark Sold</button>
                    <button style={{ ...smBtnSt, borderColor:C.muted, color:C.muted }} onClick={()=>unlist(item.id)}>Unlist</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showSell&&<SellModal item={showSell} onClose={()=>setShowSell(null)} onConfirmSale={()=>setShowSell(null)} />}
    </div>
  );
}

// ── Wishlist Page ──────────────────────────────────────────────────────────
function Wishlist({ wishlist, setWishlist, categories }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(emptyWish);

  function openAdd()    { setForm({...emptyWish,category:categories[0],tags:[]}); setEditId(null); setShowForm(true); }
  function openEdit(it) { setForm({...it,tags:it.tags||[]}); setEditId(it.id); setShowForm(true); }
  function closeForm()  { setShowForm(false); setEditId(null); }
  function saveWish() {
    if(!form.name) return;
    const c={...form,id:editId||Date.now(),estimatedCost:Number(form.estimatedCost)||0,needLevel:Number(form.needLevel),tags:form.tags||[]};
    if(editId) setWishlist(wishlist.map(i=>i.id===editId?c:i)); else setWishlist([...wishlist,c]);
    closeForm();
  }
  function deleteWish(id) { setWishlist(wishlist.filter(i=>i.id!==id)); }

  const total  = wishlist.reduce((s,i)=>s+Number(i.estimatedCost||0),0);
  const sorted = [...wishlist].sort((a,b)=>b.needLevel-a.needLevel);

  return (
    <div style={{ padding:"28px 40px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.13em", color:C.muted }}>
          {wishlist.length} items · {fmt(total)} total
        </div>
        <button style={primaryBtnSt} onClick={openAdd}>+ Add to Wishlist</button>
      </div>
      {wishlist.length===0&&<div style={{ textAlign:"center", padding:48, color:C.muted, fontSize:"0.88rem", fontStyle:"italic" }}>Nothing on the wishlist yet.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
        {sorted.map(item => {
          const nl = NEED_LEVELS[item.needLevel];
          return (
            <div key={item.id} style={{ background:C.white, border:`1px solid ${C.rule}`, padding:"16px 18px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"0.95rem", fontWeight:700, color:C.ink, marginBottom:4 }}>{item.name}</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:item.notes?8:0 }}>
                    <span style={{ fontSize:"0.68rem", color:C.muted }}>{item.category} · {item.addedYear}</span>
                    <Pill label={nl.label} color={nl.color} />
                    {(item.tags||[]).map(t=><span key={t} style={{ background:C.offwhite, border:`1px solid ${C.rule}`, padding:"1px 7px", fontSize:"0.64rem", color:C.muted }}>{t}</span>)}
                  </div>
                  {item.notes&&<div style={{ fontSize:"0.78rem", color:C.muted, fontStyle:"italic" }}>"{item.notes}"</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  {item.estimatedCost>0&&<div style={{ fontSize:"1rem", fontWeight:700, color:C.ink }}>{fmt(item.estimatedCost)}</div>}
                  <div style={{ display:"flex", gap:6, marginTop:6, justifyContent:"flex-end" }}>
                    <button style={smBtnSt} onClick={()=>openEdit(item)}>Edit</button>
                    <button style={{...smBtnSt,borderColor:C.berry,color:C.berry}} onClick={()=>deleteWish(item.id)}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showForm&&<WishForm form={form} setForm={setForm} onSave={saveWish} onClose={closeForm} categories={categories} editId={editId} />}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]               = useState(0);
  const [items, setItems]           = useState(SAMPLE_ITEMS);
  const [wishlist, setWishlist]     = useState(SAMPLE_WISHLIST);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const forSaleCount = items.filter(i=>i.forSale).length;

  const TABS = [
    { label:"Dashboard",       jewel:C.teal   },
    { label:"Inventory",       jewel:C.purple  },
    { label:"Currently Selling", jewel:C.gold, badge: forSaleCount > 0 ? forSaleCount : null },
    { label:"Wishlist",        jewel:C.berry  },
  ];

  return (
    <div style={{ fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", background:C.offwhite, minHeight:"100vh", color:C.ink }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:${C.offwhite};}
        ::-webkit-scrollbar-thumb{background:${C.rule};}
        select,input,textarea{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
        input[type=number]::-webkit-inner-spin-button{opacity:0.4;}
      `}</style>

      <header style={{ background:C.headerBg, position:"relative", overflow:"hidden" }}>
        {/* Top jewel stripe */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.teal} 0%,${C.purple} 33%,${C.berry} 60%,${C.gold} 80%,${C.forest} 100%)` }} />
        {/* Subtle geometry */}
        <div style={{ position:"absolute", right:-20, top:-20, width:180, height:180, border:`1px solid ${C.teal}22`, borderRadius:"50%", pointerEvents:"none" }} />
        <div style={{ position:"absolute", right:20, top:8, width:100, height:100, border:`1px solid ${C.gold}18`, borderRadius:"50%", pointerEvents:"none" }} />
        {/* Bottom fade line */}
        <div style={{ position:"absolute", bottom:0, left:40, right:40, height:1, background:`linear-gradient(90deg,transparent,${C.gold}44,transparent)` }} />

        <div style={{ padding:"26px 36px 0", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
            {/* Title — all gold */}
            <h1 style={{ fontSize:"1.95rem", fontWeight:700, color:C.gold, letterSpacing:"-0.02em", lineHeight:1 }}>
              Amanda's Stuff
            </h1>
            {/* Counts */}
            <div style={{ display:"flex", gap:18, alignItems:"center" }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:"1rem", fontWeight:700, color:C.teal, lineHeight:1 }}>{items.length}</div>
                <div style={{ fontSize:"0.56rem", textTransform:"uppercase", letterSpacing:"0.12em", color:`${C.white}55` }}>items</div>
              </div>
              <div style={{ width:1, height:28, background:`${C.white}18` }} />
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:"1rem", fontWeight:700, color:C.gold, lineHeight:1 }}>{wishlist.length}</div>
                <div style={{ fontSize:"0.56rem", textTransform:"uppercase", letterSpacing:"0.12em", color:`${C.white}55` }}>wishes</div>
              </div>
              {forSaleCount > 0 && <>
                <div style={{ width:1, height:28, background:`${C.white}18` }} />
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"1rem", fontWeight:700, color:C.berry, lineHeight:1 }}>{forSaleCount}</div>
                  <div style={{ fontSize:"0.56rem", textTransform:"uppercase", letterSpacing:"0.12em", color:`${C.white}55` }}>for sale</div>
                </div>
              </>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:0 }}>
            {TABS.map((t,i) => {
              const active = tab===i;
              return (
                <button key={i} onClick={()=>setTab(i)} style={{
                  fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",
                  fontSize:"0.7rem", fontWeight:active?700:400,
                  letterSpacing:"0.1em", textTransform:"uppercase",
                  padding:"10px 22px", cursor:"pointer", border:"none",
                  borderTop: active?`2px solid ${t.jewel}`:"2px solid transparent",
                  borderLeft: active?`1px solid ${t.jewel}33`:"1px solid transparent",
                  borderRight: active?`1px solid ${t.jewel}33`:"1px solid transparent",
                  background: active ? C.white : "transparent",
                  color: active ? C.ink : `${C.white}77`,
                  position:"relative", top:1,
                  transition:"all 0.15s",
                  borderRadius:"3px 3px 0 0",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  {t.label}
                  {t.badge && (
                    <span style={{ background:C.gold, color:C.headerBg, fontSize:"0.6rem", fontWeight:700, padding:"1px 6px", borderRadius:10, lineHeight:"14px" }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main style={{ background:C.white, borderTop:`1px solid ${C.rule}`, minHeight:"calc(100vh - 120px)" }}>
        {tab===0 && <Dashboard items={items} wishlist={wishlist} />}
        {tab===1 && <Inventory items={items} setItems={setItems} categories={categories} setCategories={setCategories} />}
        {tab===2 && <CurrentlySelling items={items} setItems={setItems} />}
        {tab===3 && <Wishlist wishlist={wishlist} setWishlist={setWishlist} categories={categories} />}
      </main>
    </div>
  );
}
