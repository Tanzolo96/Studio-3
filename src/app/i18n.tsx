// Phone app language: English or Hindi (हिंदी), the language most of the floor speaks in Indore.
// Each phrase is looked up by its English text; anything not translated stays in English.
// Only the phone app is wrapped in the provider, so shared cards on the dashboard stay in English.
import { createContext, useContext, type ReactNode } from 'react';
import { create } from 'zustand';

export type Lang = 'en' | 'hi';

const read = (): Lang => {
  try {
    return localStorage.getItem('qc.lang') === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
};
export const useLangStore = create<{ lang: Lang; set: (l: Lang) => void }>((set) => ({
  lang: read(),
  set: (lang) => {
    try {
      localStorage.setItem('qc.lang', lang);
    } catch {
      /* storage blocked */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

const LangContext = createContext<Lang>('en');
export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useLangStore((s) => s.lang);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

const HI: Record<string, string> = {
  // navigation and shell
  Alerts: 'अलर्ट',
  'Raise ticket': 'शिकायत दर्ज करें',
  History: 'पुराने रिकॉर्ड',
  Back: 'वापस',
  'Tap anywhere to turn on alert sound': 'अलर्ट की आवाज़ चालू करने के लिए स्क्रीन पर कहीं भी छुएँ',
  Language: 'भाषा',
  // tests and words on readings
  Count: 'काउंट',
  CSP: 'CSP (मज़बूती)',
  Twist: 'ट्विस्ट',
  Unevenness: 'असमानता (CV)',
  'Too thick': 'बहुत मोटा',
  'Too fine': 'बहुत पतला',
  'Too weak': 'बहुत कमज़ोर',
  'Above limit': 'सीमा से ऊपर',
  'Twist too low': 'ट्विस्ट बहुत कम',
  'Twist too high': 'ट्विस्ट बहुत ज़्यादा',
  'Below limit': 'सीमा से नीचे',
  'Too uneven': 'बहुत असमान',
  'Within limit': 'सीमा के अंदर',
  'Waiting for a reading': 'रीडिंग का इंतज़ार',
  Limit: 'सीमा',
  Critical: 'गंभीर',
  Major: 'ज़रूरी',
  Minor: 'मामूली',
  // lab
  Lab: 'लैब',
  'Report a failed test': 'फेल टेस्ट की रिपोर्ट करें',
  'Only for readings outside the limit. Passing tests stay in the register as today.': 'सिर्फ़ सीमा से बाहर की रीडिंग के लिए। पास टेस्ट पहले की तरह रजिस्टर में ही लिखें।',
  'Urgent tests from the floor': 'फ्लोर से ज़रूरी टेस्ट',
  'Nothing urgent': 'कुछ ज़रूरी नहीं',
  'Re-tests after a fix and checks on other frames of the same lot show up here, riskiest first.': 'ठीक होने के बाद दोबारा टेस्ट यहाँ दिखेंगे, सबसे ज़रूरी पहले।',
  'Re-test after the fix': 'ठीक होने के बाद दोबारा टेस्ट',
  'Your reports today': 'आज की आपकी रिपोर्ट',
  'Sent to {name}, the supervisor of {frame}. You can follow it here.': '{frame} के सुपरवाइज़र {name} को भेज दिया गया। आप यहाँ देख सकते हैं।',
  'Frame and lot are on the sample label': 'फ्रेम और लॉट सैंपल के लेबल पर लिखे हैं',
  Frame: 'फ्रेम',
  'Which test': 'कौन सा टेस्ट',
  Reading: 'रीडिंग',
  'Lot {lot} · {product}. Check it matches the label.': 'लॉट {lot} · {product}। लेबल से मिलाकर देखें।',
  'Enter a number, like 28.9': 'संख्या लिखें, जैसे 28.9',
  'This is inside the limit. Only report readings outside it.': 'यह सीमा के अंदर है। सिर्फ़ सीमा से बाहर की रीडिंग भेजें।',
  'Report failed test': 'फेल टेस्ट भेजें',
  '{name} (supervisor) is alerted at once.': '{name} (सुपरवाइज़र) को तुरंत अलर्ट जाएगा।',
  'The shift supervisor is alerted at once.': 'शिफ्ट सुपरवाइज़र को तुरंत अलर्ट जाएगा।',
  'Only the lab tester and the QC manager report results.': 'रिज़ल्ट सिर्फ़ लैब टेस्टर और QC मैनेजर भेजते हैं।',
  // status words
  'Waiting for someone to start fixing': 'कोई ठीक करना शुरू करे, इसका इंतज़ार',
  '{name} is fixing it': '{name} ठीक कर रहे हैं',
  'Fixed, waiting for re-test': 'ठीक हो गया, दोबारा टेस्ट बाकी',
  'Re-test passed, closed': 'दोबारा टेस्ट पास, बंद',
  Closed: 'बंद',
  // supervisor home
  'Active issues': 'चालू समस्याएँ',
  'All clear': 'सब ठीक है',
  'No active issues. Every frame is running normally. A new fault will ring this phone.': 'कोई समस्या नहीं। सभी फ्रेम ठीक चल रहे हैं। नई गड़बड़ी होने पर यह फ़ोन बजेगा।',
  'Nothing has been escalated to you.': 'आपके पास कुछ नहीं भेजा गया है।',
  'See resolved issues in History': 'हल हुई समस्याएँ रिकॉर्ड में देखें',
  '{n} need attention': '{n} पर ध्यान देना है',
  'Fixed, waiting for the lab re-test': 'ठीक हो गए, लैब के दोबारा टेस्ट का इंतज़ार',
  // alert pop-up
  'Critical alert': 'गंभीर अलर्ट',
  'Major alert': 'ज़रूरी अलर्ट',
  'Backup: not seen in 5 min': 'बैकअप: 5 मिनट में किसी ने नहीं देखा',
  'Escalated to you': 'आपके पास भेजा गया',
  '{frame} · Lot {lot} · {yarn} yarn': '{frame} · लॉट {lot} · {yarn} धागा',
  'Not seen by the {shift} shift supervisor for {n} min': '{shift} शिफ्ट सुपरवाइज़र ने {n} मिनट से नहीं देखा',
  'I’m fixing it': 'मैं ठीक कर रहा हूँ',
  Later: 'बाद में',
  'See who is on it': 'देखें कौन ठीक कर रहा है',
  '{n} more alerts after this one': 'इसके बाद {n} और अलर्ट',
  // alert detail
  'Not resolved yet': 'अभी हल नहीं हुआ',
  Resolved: 'हल हो गया',
  'Re-test failed': 'दोबारा टेस्ट फेल',
  'Fixing: I’m on it': 'ठीक करना शुरू: मैं कर रहा हूँ',
  'Fixed: tell us what happened': 'ठीक हो गया: क्या हुआ बताएँ',
  'Lab re-test confirms the fix': 'लैब दोबारा टेस्ट करके पक्का करेगी',
  'Starts the fixing time and stops the alert going to anyone else.': 'ठीक करने का समय शुरू होगा और अलर्ट किसी और के पास नहीं जाएगा।',
  'Fixing for': 'ठीक करते हुए',
  'When the frame is running right, tap Fixed.': 'जब फ्रेम ठीक चलने लगे, "ठीक हो गया" दबाएँ।',
  Fixed: 'ठीक हो गया',
  'Send a fitter': 'फिटर भेजें',
  'Waiting for a spare part': 'स्पेयर पार्ट का इंतज़ार',
  'Part arrived': 'पार्ट आ गया',
  'Hand over to next shift': 'अगली शिफ्ट को सौंपें',
  'The lab re-tests {frame} by {time}. If it fails, this comes back to you.': 'लैब {time} तक {frame} दोबारा टेस्ट करेगी। फेल हुआ तो यह आपके पास वापस आएगा।',
  'At the top of the lab’s list. A pass confirms the fix; a fail sends this back to you.': 'लैब की सूची में सबसे ऊपर। पास हुआ तो काम पक्का; फेल हुआ तो वापस आपके पास।',
  'Nobody has started fixing for {n} min.': '{n} मिनट से किसी ने ठीक करना शुरू नहीं किया।',
  'QC manager told.': 'QC मैनेजर को बताया गया।',
  'Plant head told.': 'प्लांट हेड को बताया गया।',
  'No answer in {n} min. Backup supervisor alerted.': '{n} मिनट में जवाब नहीं। बैकअप सुपरवाइज़र को अलर्ट गया।',
  'Full history · {n} updates': 'पूरा रिकॉर्ड · {n} अपडेट',
  // fix report
  '{frame} fixed': '{frame} ठीक हो गया',
  'What did you fix?': 'आपने क्या ठीक किया?',
  'Drafting zone': 'ड्राफ्टिंग ज़ोन',
  'Top rollers and aprons': 'टॉप रोलर और एप्रन',
  'Spindles and travellers': 'स्पिंडल और ट्रैवलर',
  'Creel and roving': 'क्रील और रोविंग',
  'Something else on the frame': 'फ्रेम पर कुछ और',
  'Not a machine part': 'मशीन का पार्ट नहीं',
  'Send fix report': 'रिपोर्ट भेजें',
  'Pick what you fixed': 'चुनें आपने क्या ठीक किया',
  'More details (optional)': 'और जानकारी (ज़रूरी नहीं)',
  'What caused it?': 'वजह क्या थी?',
  Machine: 'मशीन',
  Setting: 'सेटिंग',
  Material: 'माल (रोविंग)',
  Other: 'कुछ और',
  'No cause found': 'वजह नहीं मिली',
  'Yarn made since the last good test': 'पिछले सही टेस्ट के बाद बना धागा',
  'About {kg} kg since {time} (estimate). Change it if you know better.': 'लगभग {kg} किलो, {time} से (अनुमान)। पता हो तो बदल दें।',
  Note: 'नोट',
  'Took {time} to fix. The lab re-tests next.': 'ठीक करने में {time} लगा। अब लैब दोबारा टेस्ट करेगी।',
  'Add photo': 'फ़ोटो जोड़ें',
  // raise ticket
  'Report a problem you saw on the floor': 'फ्लोर पर दिखी समस्या बताएँ',
  'Which frames? Tap every frame with the problem': 'कौन से फ्रेम? समस्या वाले सभी फ्रेम छुएँ',
  'Which frames? {n} picked': 'कौन से फ्रेम? {n} चुने',
  'What’s wrong?': 'क्या गड़बड़ है?',
  'Ends breaking often': 'धागा बार-बार टूट रहा है',
  'Yarn looks thick or uneven': 'धागा मोटा या असमान दिख रहा है',
  'Machine noise or vibration': 'मशीन में आवाज़ या कंपन',
  'Wrong roving on creel': 'क्रील पर गलत रोविंग',
  'Cops look soft or badly built': 'कॉप ढीले या खराब बने',
  'Something else': 'कुछ और',
  'How serious? (suggested)': 'कितना गंभीर? (सुझाव)',
  'Note (optional)': 'नोट (ज़रूरी नहीं)',
  'Raise {n} tickets': '{n} शिकायतें दर्ज करें',
  // re-test
  'Outside the limit': 'सीमा से बाहर',
  'What happened next': 'आगे क्या हुआ',
  'Fix confirmed. The alert is closed and the supervisor is told.': 'काम पक्का हुआ। अलर्ट बंद, सुपरवाइज़र को बता दिया गया।',
  'Recorded the result': 'रिज़ल्ट दर्ज हो गया',
  'Sent back to the supervisor to fix again.': 'दोबारा ठीक करने के लिए सुपरवाइज़र को वापस भेजा गया।',
  'Marked as sample error. Closed as a false alarm.': 'सैंपल की गलती। गलत अलर्ट मानकर बंद किया।',
  'Save result': 'रिज़ल्ट सेव करें',
  Urgent: 'ज़रूरी',
  'Due now': 'अभी करना है',
  'Late by {t}': '{t} देर',
  'Due {time} · in {left}': '{time} तक · {left} बाकी',
  // lab list reasons
  'Asked to test sooner': 'जल्दी टेस्ट करने को कहा',
  'Other frame on the same lot': 'उसी लॉट का दूसरा फ्रेम',
  'Asked to test now': 'अभी टेस्ट करने को कहा',
};

export function translate(lang: Lang, en: string, vars?: Record<string, string | number>) {
  let out = lang === 'hi' ? HI[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** t('English text', { vars }) in the phone app's language. */
export function useT() {
  const lang = useContext(LangContext);
  return (en: string, vars?: Record<string, string | number>) => translate(lang, en, vars);
}
export const useLang = () => useContext(LangContext);
