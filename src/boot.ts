// Jury links carry who this device is and which room it joins, before the hash:
//   .../Studio-3/?room=jury-4821&as=ramesh#app        a phone, signed in as Ramesh
//   .../Studio-3/?room=jury-4821&dash=priya#dashboard  the laptop, as Priya
// Saved before the store loads, then removed from the address so a refresh keeps the same page.
try {
  const q = new URLSearchParams(location.search);
  const room = q.get('room');
  if (room !== null) {
    if (room === '' || room === 'off') localStorage.removeItem('qc.room');
    else if (/^[a-z0-9-]{3,24}$/.test(room)) localStorage.setItem('qc.room', room);
  }
  const as = q.get('as');
  if (as && /^[a-z]+$/.test(as)) {
    localStorage.setItem('qc.app.user', as);
    localStorage.setItem('qc.app.ready', '1');
  }
  const dash = q.get('dash');
  if (dash && /^[a-z]+$/.test(dash)) localStorage.setItem('qc.dash.user', dash);
  if (room !== null || as || dash) history.replaceState(null, '', location.pathname + location.hash);
} catch {
  /* storage blocked: the page still works on its own */
}
export {};
