// Bangla names for Bangladesh's divisions and districts. Areas carry their own
// areaNameBn in the database; divisions/districts are plain English strings there.

export const DIVISION_BN: Record<string, string> = {
  Barishal: "বরিশাল",
  Barisal: "বরিশাল",
  Chattogram: "চট্টগ্রাম",
  Chittagong: "চট্টগ্রাম",
  Dhaka: "ঢাকা",
  Khulna: "খুলনা",
  Mymensingh: "ময়মনসিংহ",
  Rajshahi: "রাজশাহী",
  Rangpur: "রংপুর",
  Sylhet: "সিলেট",
};

export const DISTRICT_BN: Record<string, string> = {
  // Dhaka division
  Dhaka: "ঢাকা",
  Faridpur: "ফরিদপুর",
  Gazipur: "গাজীপুর",
  Gopalganj: "গোপালগঞ্জ",
  Kishoreganj: "কিশোরগঞ্জ",
  Madaripur: "মাদারীপুর",
  Manikganj: "মানিকগঞ্জ",
  Munshiganj: "মুন্সীগঞ্জ",
  Narayanganj: "নারায়ণগঞ্জ",
  Narsingdi: "নরসিংদী",
  Rajbari: "রাজবাড়ী",
  Shariatpur: "শরীয়তপুর",
  Tangail: "টাঙ্গাইল",
  // Chattogram division
  Bandarban: "বান্দরবান",
  Brahmanbaria: "ব্রাহ্মণবাড়িয়া",
  Chandpur: "চাঁদপুর",
  Chattogram: "চট্টগ্রাম",
  Chittagong: "চট্টগ্রাম",
  Cumilla: "কুমিল্লা",
  Comilla: "কুমিল্লা",
  "Cox's Bazar": "কক্সবাজার",
  Feni: "ফেনী",
  Khagrachhari: "খাগড়াছড়ি",
  Lakshmipur: "লক্ষ্মীপুর",
  Noakhali: "নোয়াখালী",
  Rangamati: "রাঙ্গামাটি",
  // Rajshahi division
  Bogura: "বগুড়া",
  Bogra: "বগুড়া",
  Joypurhat: "জয়পুরহাট",
  Naogaon: "নওগাঁ",
  Natore: "নাটোর",
  Chapainawabganj: "চাঁপাইনবাবগঞ্জ",
  Pabna: "পাবনা",
  Rajshahi: "রাজশাহী",
  Sirajganj: "সিরাজগঞ্জ",
  // Khulna division
  Bagerhat: "বাগেরহাট",
  Chuadanga: "চুয়াডাঙ্গা",
  Jashore: "যশোর",
  Jessore: "যশোর",
  Jhenaidah: "ঝিনাইদহ",
  Khulna: "খুলনা",
  Kushtia: "কুষ্টিয়া",
  Magura: "মাগুরা",
  Meherpur: "মেহেরপুর",
  Narail: "নড়াইল",
  Satkhira: "সাতক্ষীরা",
  // Barishal division
  Barguna: "বরগুনা",
  Barishal: "বরিশাল",
  Barisal: "বরিশাল",
  Bhola: "ভোলা",
  Jhalokati: "ঝালকাঠি",
  Patuakhali: "পটুয়াখালী",
  Pirojpur: "পিরোজপুর",
  // Sylhet division
  Habiganj: "হবিগঞ্জ",
  Moulvibazar: "মৌলভীবাজার",
  Sunamganj: "সুনামগঞ্জ",
  Sylhet: "সিলেট",
  // Rangpur division
  Dinajpur: "দিনাজপুর",
  Gaibandha: "গাইবান্ধা",
  Kurigram: "কুড়িগ্রাম",
  Lalmonirhat: "লালমনিরহাট",
  Nilphamari: "নীলফামারী",
  Panchagarh: "পঞ্চগড়",
  Rangpur: "রংপুর",
  Thakurgaon: "ঠাকুরগাঁও",
  // Mymensingh division
  Jamalpur: "জামালপুর",
  Mymensingh: "ময়মনসিংহ",
  Netrokona: "নেত্রকোণা",
  Sherpur: "শেরপুর",
};

/** District name in the given locale (falls back to the stored English name). */
export const districtName = (name: string, locale: string) => (locale === "bn" ? (DISTRICT_BN[name] ?? name) : name);
/** Division name in the given locale. */
export const divisionName = (name: string, locale: string) => (locale === "bn" ? (DIVISION_BN[name] ?? name) : name);
/** Area name in the given locale. */
export const areaLabel = (a: { areaName: string; areaNameBn?: string }, locale: string) =>
  locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName;
