import { useState, useMemo, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCWlqpYrQKNsgJ8xqu7v-tSgWthfNeiGG8",
  authDomain: "yach-splitter.firebaseapp.com",
  databaseURL: "https://yach-splitter-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "yach-splitter",
  storageBucket: "yach-splitter.firebasestorage.app",
  messagingSenderId: "766403014692",
  appId: "1:766403014692:web:f3f30ae796c4af991328b1",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const STATE_REF = ref(db, "yacht-splitter/state");

const ADMIN_PASSWORD = "poseidon";
const CREW = ["Martin", "Tomáš", "Petra", "Jakub", "Zuzana", "Lucia", "Marek", "Jana", "Patrik", "Mirka", "René"];
const DEFAULT_SKIPPER = "René";

const WAVE = () => (
  <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ width: "100%", height: "40px", display: "block" }}>
    <path d="M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 L1200,60 L0,60 Z" fill="#0e3a5c" opacity="0.15" />
    <path d="M0,40 C150,10 350,60 600,40 C850,20 1050,60 1200,40 L1200,60 L0,60 Z" fill="#0e3a5c" opacity="0.1" />
  </svg>
);

function minimizeTransfers(balances) {
  const credits = [];
  const debts = [];
  Object.entries(balances).forEach(([name, bal]) => {
    if (bal > 0.005) credits.push({ name, amount: bal });
    else if (bal < -0.005) debts.push({ name, amount: -bal });
  });
  credits.sort((a, b) => b.amount - a.amount);
  debts.sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < credits.length && j < debts.length) {
    const amount = Math.min(credits[i].amount, debts[j].amount);
    transfers.push({ from: debts[j].name, to: credits[i].name, amount });
    credits[i].amount -= amount;
    debts[j].amount -= amount;
    if (credits[i].amount < 0.005) i++;
    if (debts[j].amount < 0.005) j++;
  }
  return transfers;
}

function PasswordModal({ action, onConfirm, onCancel }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  const confirm = () => {
    if (pw === ADMIN_PASSWORD) {
      onConfirm();
    } else {
      setErr(true);
      setPw("");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "linear-gradient(160deg,#0a2540,#0e3a5c)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Zadaj heslo</div>
        <div style={{ fontSize: 12, color: "#7fb9d8", marginBottom: 20 }}>{action}</div>
        <input
          autoFocus
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && confirm()}
          placeholder="heslo..."
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.08)", border: `1px solid ${err ? "#e74c3c" : "rgba(255,255,255,0.15)"}`, borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 6, textAlign: "center", letterSpacing: "0.1em" }}
        />
        {err && <div style={{ fontSize: 12, color: "#e74c3c", marginBottom: 10 }}>Nesprávne heslo</div>}
        {!err && <div style={{ marginBottom: 10 }} />}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px", color: "#7fb9d8", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Zrušiť</button>
          <button onClick={confirm} style={{ flex: 1, background: "linear-gradient(90deg,#1a6ea8,#2980b9)", border: "none", borderRadius: 10, padding: "10px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Potvrdiť</button>
        </div>
      </div>
    </div>
  );
}

export default function YachtSplitter() {
  const [crew, setCrew] = useState(CREW);
  const [skipper, setSkipper] = useState(DEFAULT_SKIPPER);
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ payer: CREW[0], amount: "", note: "" });
  const [tab, setTab] = useState("expenses");
  const [newCrewName, setNewCrewName] = useState("");
  const [syncStatus, setSyncStatus] = useState("loading");
  const [lastSync, setLastSync] = useState(null);
  const [modal, setModal] = useState(null);

  const withPassword = (actionLabel, fn) => {
    setModal({ action: actionLabel, onConfirm: () => { setModal(null); fn(); } });
  };

  const saveState = useCallback((newCrew, newSkipper, newExpenses) => {
    setSyncStatus("saving");
    set(STATE_REF, { crew: newCrew, skipper: newSkipper, expenses: newExpenses, updatedAt: Date.now() })
      .then(() => setSyncStatus("ok"))
      .catch(() => setSyncStatus("error"));
  }, []);

  useEffect(() => {
    const unsub = onValue(
      STATE_REF,
      (snap) => {
        const data = snap.val();
        if (data) {
          setCrew(data.crew || CREW);
          setSkipper(data.skipper || DEFAULT_SKIPPER);
          setExpenses(data.expenses || []);
          setForm(f => ({ ...f, payer: (data.crew || CREW)[0] }));
        }
        setSyncStatus("ok");
        setLastSync(new Date());
      },
      () => setSyncStatus("error")
    );
    return () => unsub();
  }, []);

  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const payers = crew.filter(c => c !== skipper);
  const perPerson = payers.length > 0 ? totalSpent / payers.length : 0;

  const balances = useMemo(() => {
    const b = {};
    crew.forEach(c => { b[c] = 0; });
    expenses.forEach(e => { if (b[e.payer] !== undefined) b[e.payer] += e.amount; });
    crew.forEach(c => { if (c !== skipper) b[c] = (b[c] || 0) - perPerson; });
    return b;
  }, [expenses, crew, perPerson, skipper]);

  const transfers = useMemo(() => minimizeTransfers({ ...balances }), [balances]);

  const addExpense = () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0 || !form.note.trim()) return;
    const newExpenses = [...expenses, { id: Date.now(), payer: form.payer, amount: amt, note: form.note.trim() }];
    setExpenses(newExpenses);
    setForm(f => ({ ...f, amount: "", note: "" }));
    saveState(crew, skipper, newExpenses);
  };

  const removeExpense = (id) => {
    withPassword("Zmazať výdavok", () => {
      const newExpenses = expenses.filter(e => e.id !== id);
      setExpenses(newExpenses);
      saveState(crew, skipper, newExpenses);
    });
  };

  const addCrew = () => {
    const name = newCrewName.trim();
    if (!name || crew.includes(name)) return;
    withPassword(`Pridať člena "${name}"`, () => {
      const newCrew = [...crew, name];
      setCrew(newCrew);
      setNewCrewName("");
      setForm(f => ({ ...f, payer: name }));
      saveState(newCrew, skipper, expenses);
    });
  };

  const removeCrew = (name) => {
    if (crew.length <= 2) return;
    withPassword(`Odstrániť člena "${name}"`, () => {
      const newCrew = crew.filter(c => c !== name);
      const newExpenses = expenses.filter(e => e.payer !== name);
      const newSkipper = skipper === name ? newCrew[0] : skipper;
      setCrew(newCrew);
      setExpenses(newExpenses);
      setSkipper(newSkipper);
      setForm(f => ({ ...f, payer: newCrew[0] }));
      saveState(newCrew, newSkipper, newExpenses);
    });
  };

  const handleSetSkipper = (name) => {
    withPassword(`Nastaviť skipera na "${name}"`, () => {
      setSkipper(name);
      saveState(crew, name, expenses);
    });
  };

  const fmt = (n) => n.toFixed(2) + " €";

  const exportCSV = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    let csv = "=== VÝDAVKY ===\r\n";
    csv += "Kto platil,Suma (EUR),Popis,Dátum\r\n";
    expenses.forEach(e => {
      csv += `"${e.payer}",${e.amount.toFixed(2)},"${e.note}","${new Date(e.id).toLocaleDateString("sk-SK")}"\r\n`;
    });
    csv += "\r\n=== BILANCIE ===\r\n";
    csv += "Meno,Rola,Zaplatil (EUR),Podiel (EUR),Bilancia (EUR)\r\n";
    crew.forEach(c => {
      const paid = expenses.filter(e => e.payer === c).reduce((s, e) => s + e.amount, 0);
      csv += `"${c}","${c === skipper ? "Skiper" : "Posádka"}",${paid.toFixed(2)},${(c === skipper ? 0 : perPerson).toFixed(2)},${(balances[c] || 0).toFixed(2)}\r\n`;
    });
    csv += "\r\n=== ZÚČTOVANIE ===\r\nOd,Komu,Suma (EUR)\r\n";
    transfers.forEach(t => { csv += `"${t.from}","${t.to}",${t.amount.toFixed(2)}\r\n`; });
    csv += `\r\n=== ZÁLOHA DAT (NEMAZAT) ===\r\nSKIPPER,"${skipper}"\r\nCREW,"${crew.join("|")}"\r\n`;
    expenses.forEach(e => { csv += `EXPENSE,${e.id},"${e.payer}",${e.amount.toFixed(2)},"${e.note}"\r\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yacht-splitter-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.replace(/^\uFEFF/, "").split(/\r?\n/);
        let newSkipper = skipper;
        let newCrew = [];
        const newExpenses = [];
        lines.forEach(line => {
          if (line.startsWith("SKIPPER,")) {
            newSkipper = line.split(",")[1].replace(/"/g, "").trim();
          } else if (line.startsWith("CREW,")) {
            newCrew = line.replace(/^CREW,"?/, "").replace(/"?\s*$/, "").split("|").map(s => s.trim()).filter(Boolean);
          } else if (line.startsWith("EXPENSE,")) {
            const m = line.match(/^EXPENSE,(\d+),"([^"]+)",([0-9.]+),"([^"]*)"/);
            if (m) newExpenses.push({ id: parseInt(m[1]), payer: m[2], amount: parseFloat(m[3]), note: m[4] });
          }
        });
        if (newCrew.length >= 2) {
          withPassword("Importovať dáta zo súboru", () => {
            setCrew(newCrew);
            setSkipper(newSkipper);
            setExpenses(newExpenses);
            setForm(f => ({ ...f, payer: newCrew[0] }));
            saveState(newCrew, newSkipper, newExpenses);
            alert(`Import úspešný: ${newCrew.length} členov, ${newExpenses.length} výdavkov.`);
          });
        } else {
          alert("Súbor neobsahuje platné zálohovacie dáta.");
        }
      } catch {
        alert("Chyba pri čítaní súboru.");
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const syncDot = syncStatus === "ok" ? "#2ecc71" : syncStatus === "error" ? "#e74c3c" : "#f1c40f";
  const syncLabel = syncStatus === "ok"
    ? `Synced ${lastSync ? lastSync.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) : ""}`
    : syncStatus === "error" ? "Chyba synchronizácie"
    : syncStatus === "saving" ? "Ukladám..." : "Načítavam...";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2540 0%, #0e3a5c 40%, #1a5276 100%)", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#e8f4f8" }}>
      {modal && <PasswordModal action={modal.action} onConfirm={modal.onConfirm} onCancel={() => setModal(null)} />}

      <div style={{ textAlign: "center", padding: "36px 20px 8px" }}>
        <div style={{ fontSize: 42, marginBottom: 4 }}>⛵</div>
        <h1 style={{ margin: 0, fontSize: "clamp(1.6rem, 5vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>Yacht Splitter</h1>
        <p style={{ margin: "6px 0 0", color: "#7fb9d8", fontSize: 14 }}>Rozúčtovanie výdavkov na plavbe</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: syncDot, boxShadow: `0 0 6px ${syncDot}` }} />
          <span style={{ fontSize: 11, color: "#7fb9d8" }}>{syncLabel}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
          <button
            onClick={exportCSV}
            disabled={expenses.length === 0}
            style={{ background: expenses.length > 0 ? "rgba(46,204,113,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${expenses.length > 0 ? "rgba(46,204,113,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "6px 16px", color: expenses.length > 0 ? "#2ecc71" : "#7fb9d8", fontSize: 13, fontWeight: 600, cursor: expenses.length > 0 ? "pointer" : "default" }}
          >
            ⬇ Export CSV
          </button>
          <label style={{ background: "rgba(127,185,216,0.15)", border: "1px solid rgba(127,185,216,0.3)", borderRadius: 20, padding: "6px 16px", color: "#7fb9d8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⬆ Import CSV
            <input type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      <WAVE />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Spolu výdavky", val: fmt(totalSpent), icon: "💰" },
            { label: "Na osobu", val: fmt(perPerson), icon: "👤" },
            { label: "Platcovia", val: payers.length + " ľudí", icon: "🧑‍✈️" }
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 20 }}>{s.icon}</div>
              <div style={{ fontSize: "clamp(0.85rem,2.5vw,1rem)", fontWeight: 700, color: "#fff", marginTop: 2 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "#7fb9d8", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 12, color: "#7fb9d8", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>POSÁDKA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {crew.map(c => {
              const isSk = c === skipper;
              return (
                <div key={c} style={{ background: isSk ? "rgba(241,196,15,0.2)" : "rgba(127,185,216,0.2)", border: `1px solid ${isSk ? "rgba(241,196,15,0.4)" : "rgba(127,185,216,0.3)"}`, borderRadius: 20, padding: "4px 10px 4px 8px", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                  <span onClick={() => handleSetSkipper(c)} style={{ cursor: "pointer", userSelect: "none" }}>
                    {isSk ? "⚓" : "👤"} {c}
                    {isSk && <span style={{ fontSize: 10, color: "#f1c40f", marginLeft: 3, fontWeight: 700 }}>SKIPER</span>}
                  </span>
                  {crew.length > 2 && (
                    <button onClick={() => removeCrew(c)} style={{ background: "none", border: "none", color: "#7fb9d8", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#7fb9d8", marginBottom: 10, opacity: 0.7 }}>⚓ Klikni na meno pre nastavenie skipera · Skiper neplatí žiadny podiel</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newCrewName}
              onChange={e => setNewCrewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCrew()}
              placeholder="Pridať člena..."
              style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }}
            />
            <button onClick={addCrew} style={{ background: "#2980b9", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Pridať</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[["expenses", "📋 Výdavky"], ["settle", "⚖️ Zúčtovanie"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: tab === key ? "#2980b9" : "rgba(255,255,255,0.07)", color: tab === key ? "#fff" : "#7fb9d8" }}>{label}</button>
          ))}
        </div>

        {tab === "expenses" && (
          <>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 12, color: "#7fb9d8", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>NOVÝ VÝDAVOK</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#7fb9d8", marginBottom: 4 }}>Kto platil</div>
                  <select value={form.payer} onChange={e => setForm(f => ({ ...f, payer: e.target.value }))} style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 10px", color: "#fff", fontSize: 13, outline: "none" }}>
                    {crew.map(c => <option key={c} value={c} style={{ background: "#0e3a5c" }}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#7fb9d8", marginBottom: 4 }}>Suma (€)</div>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 10px", color: "#fff", fontSize: 13, outline: "none" }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#7fb9d8", marginBottom: 4 }}>Popis</div>
                <input
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addExpense()}
                  placeholder="napr. Tankování, potraviny, kotviště..."
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }}
                />
              </div>
              <button onClick={addExpense} style={{ width: "100%", background: "linear-gradient(90deg,#1a6ea8,#2980b9)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 16px rgba(41,128,185,0.4)" }}>+ Pridať výdavok</button>
            </div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", color: "#7fb9d8", padding: "32px 0", fontSize: 14 }}>🌊 Zatiaľ žiadne výdavky.<br />Pridajte prvý výdavok vyššie.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {expenses.map(e => (
                  <div key={e.id} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#1a6ea8,#2980b9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{e.payer[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.note}</div>
                      <div style={{ fontSize: 12, color: "#7fb9d8" }}>{e.payer}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#5dade2" }}>{fmt(e.amount)}</div>
                    <button onClick={() => removeExpense(e.id)} style={{ background: "rgba(255,80,80,0.15)", border: "none", borderRadius: 8, width: 28, height: 28, color: "#ff6b6b", cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "settle" && (
          <>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 12, color: "#7fb9d8", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>BILANCIE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {crew.map(c => {
                  const bal = balances[c] || 0;
                  const isPos = bal > 0.005;
                  const isNeg = bal < -0.005;
                  const isSkip = c === skipper;
                  return (
                    <div key={c} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: isSkip ? "rgba(241,196,15,0.25)" : isPos ? "rgba(46,204,113,0.25)" : isNeg ? "rgba(231,76,60,0.25)" : "rgba(127,185,216,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: isSkip ? "#f1c40f" : isPos ? "#2ecc71" : isNeg ? "#e74c3c" : "#7fb9d8" }}>
                        {isSkip ? "⚓" : c[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                          {c} {isSkip && <span style={{ fontSize: 10, color: "#f1c40f", fontWeight: 700 }}>SKIPER</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#7fb9d8" }}>
                          zaplatil {fmt(expenses.filter(e => e.payer === c).reduce((s, e) => s + e.amount, 0))}
                          {isSkip ? " · podiel 0 €" : ` · podiel ${fmt(perPerson)}`}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isSkip ? "#f1c40f" : isPos ? "#2ecc71" : isNeg ? "#e74c3c" : "#7fb9d8" }}>
                        {(isPos || (isSkip && bal > 0)) ? "+" : ""}{fmt(bal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 12, color: "#7fb9d8", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>MINIMÁLNE PREVODY ({transfers.length})</div>
              {transfers.length === 0 ? (
                <div style={{ textAlign: "center", color: "#2ecc71", padding: "16px 0", fontSize: 14 }}>✅ Všetci ste vyrovnaní!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {transfers.map((t, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: "rgba(231,76,60,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 13, fontWeight: 700, color: "#e74c3c" }}>{t.from}</span>
                        <span style={{ color: "#7fb9d8", fontSize: 18 }}>→</span>
                        <span style={{ background: "rgba(46,204,113,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 13, fontWeight: 700, color: "#2ecc71" }}>{t.to}</span>
                        <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: "#5dade2" }}>{fmt(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
