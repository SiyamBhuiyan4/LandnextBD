// Bangladesh's 64 districts, grouped by division. Coordinates are the district
// town centre, accurate enough to seed an area row, centre a map and build a
// geohash; a seller who needs the exact plot still drops a pin on the map.
//
// Spelling follows the current official English names (Bogura, Cumilla,
// Jashore, …). lib/places.ts keeps the older spellings as Bangla-name aliases
// so old links and data still resolve.

export type DistrictSeed = {
  name: string;
  nameBn: string;
  division: string;
  lat: number;
  lng: number;
};

export const DISTRICTS: DistrictSeed[] = [
  // Dhaka (13)
  { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka", lat: 23.8103, lng: 90.4125 },
  { name: "Faridpur", nameBn: "ফরিদপুর", division: "Dhaka", lat: 23.607, lng: 89.8429 },
  { name: "Gazipur", nameBn: "গাজীপুর", division: "Dhaka", lat: 23.9999, lng: 90.4203 },
  { name: "Gopalganj", nameBn: "গোপালগঞ্জ", division: "Dhaka", lat: 23.005, lng: 89.8266 },
  { name: "Kishoreganj", nameBn: "কিশোরগঞ্জ", division: "Dhaka", lat: 24.4449, lng: 90.7766 },
  { name: "Madaripur", nameBn: "মাদারীপুর", division: "Dhaka", lat: 23.1641, lng: 90.1897 },
  { name: "Manikganj", nameBn: "মানিকগঞ্জ", division: "Dhaka", lat: 23.8644, lng: 90.0047 },
  { name: "Munshiganj", nameBn: "মুন্সীগঞ্জ", division: "Dhaka", lat: 23.5422, lng: 90.5305 },
  { name: "Narayanganj", nameBn: "নারায়ণগঞ্জ", division: "Dhaka", lat: 23.6238, lng: 90.5 },
  { name: "Narsingdi", nameBn: "নরসিংদী", division: "Dhaka", lat: 23.9322, lng: 90.7151 },
  { name: "Rajbari", nameBn: "রাজবাড়ী", division: "Dhaka", lat: 23.7574, lng: 89.6444 },
  { name: "Shariatpur", nameBn: "শরীয়তপুর", division: "Dhaka", lat: 23.2423, lng: 90.4348 },
  { name: "Tangail", nameBn: "টাঙ্গাইল", division: "Dhaka", lat: 24.2513, lng: 89.9167 },

  // Chattogram (11)
  { name: "Bandarban", nameBn: "বান্দরবান", division: "Chattogram", lat: 22.1953, lng: 92.2184 },
  { name: "Brahmanbaria", nameBn: "ব্রাহ্মণবাড়িয়া", division: "Chattogram", lat: 23.9571, lng: 91.1119 },
  { name: "Chandpur", nameBn: "চাঁদপুর", division: "Chattogram", lat: 23.2333, lng: 90.6712 },
  { name: "Chattogram", nameBn: "চট্টগ্রাম", division: "Chattogram", lat: 22.3569, lng: 91.7832 },
  { name: "Cox's Bazar", nameBn: "কক্সবাজার", division: "Chattogram", lat: 21.4272, lng: 92.0058 },
  { name: "Cumilla", nameBn: "কুমিল্লা", division: "Chattogram", lat: 23.4607, lng: 91.1809 },
  { name: "Feni", nameBn: "ফেনী", division: "Chattogram", lat: 23.0159, lng: 91.3976 },
  { name: "Khagrachhari", nameBn: "খাগড়াছড়ি", division: "Chattogram", lat: 23.1193, lng: 91.9847 },
  { name: "Lakshmipur", nameBn: "লক্ষ্মীপুর", division: "Chattogram", lat: 22.9447, lng: 90.8282 },
  { name: "Noakhali", nameBn: "নোয়াখালী", division: "Chattogram", lat: 22.8696, lng: 91.0995 },
  { name: "Rangamati", nameBn: "রাঙ্গামাটি", division: "Chattogram", lat: 22.6533, lng: 92.175 },

  // Rajshahi (8)
  { name: "Bogura", nameBn: "বগুড়া", division: "Rajshahi", lat: 24.8481, lng: 89.3729 },
  { name: "Chapainawabganj", nameBn: "চাঁপাইনবাবগঞ্জ", division: "Rajshahi", lat: 24.5965, lng: 88.2775 },
  { name: "Joypurhat", nameBn: "জয়পুরহাট", division: "Rajshahi", lat: 25.0968, lng: 89.0227 },
  { name: "Naogaon", nameBn: "নওগাঁ", division: "Rajshahi", lat: 24.7936, lng: 88.9318 },
  { name: "Natore", nameBn: "নাটোর", division: "Rajshahi", lat: 24.4206, lng: 88.9414 },
  { name: "Pabna", nameBn: "পাবনা", division: "Rajshahi", lat: 24.0064, lng: 89.2372 },
  { name: "Rajshahi", nameBn: "রাজশাহী", division: "Rajshahi", lat: 24.3745, lng: 88.6042 },
  { name: "Sirajganj", nameBn: "সিরাজগঞ্জ", division: "Rajshahi", lat: 24.4534, lng: 89.7007 },

  // Khulna (10)
  { name: "Bagerhat", nameBn: "বাগেরহাট", division: "Khulna", lat: 22.6516, lng: 89.7859 },
  { name: "Chuadanga", nameBn: "চুয়াডাঙ্গা", division: "Khulna", lat: 23.6402, lng: 88.8411 },
  { name: "Jashore", nameBn: "যশোর", division: "Khulna", lat: 23.1664, lng: 89.2081 },
  { name: "Jhenaidah", nameBn: "ঝিনাইদহ", division: "Khulna", lat: 23.5448, lng: 89.1539 },
  { name: "Khulna", nameBn: "খুলনা", division: "Khulna", lat: 22.8456, lng: 89.5403 },
  { name: "Kushtia", nameBn: "কুষ্টিয়া", division: "Khulna", lat: 23.9013, lng: 89.1206 },
  { name: "Magura", nameBn: "মাগুরা", division: "Khulna", lat: 23.4855, lng: 89.4198 },
  { name: "Meherpur", nameBn: "মেহেরপুর", division: "Khulna", lat: 23.7622, lng: 88.6318 },
  { name: "Narail", nameBn: "নড়াইল", division: "Khulna", lat: 23.1725, lng: 89.5125 },
  { name: "Satkhira", nameBn: "সাতক্ষীরা", division: "Khulna", lat: 22.7185, lng: 89.0705 },

  // Barishal (6)
  { name: "Barguna", nameBn: "বরগুনা", division: "Barishal", lat: 22.0953, lng: 90.1121 },
  { name: "Barishal", nameBn: "বরিশাল", division: "Barishal", lat: 22.701, lng: 90.3535 },
  { name: "Bhola", nameBn: "ভোলা", division: "Barishal", lat: 22.6859, lng: 90.6482 },
  { name: "Jhalokati", nameBn: "ঝালকাঠি", division: "Barishal", lat: 22.6406, lng: 90.1987 },
  { name: "Patuakhali", nameBn: "পটুয়াখালী", division: "Barishal", lat: 22.3596, lng: 90.3298 },
  { name: "Pirojpur", nameBn: "পিরোজপুর", division: "Barishal", lat: 22.5841, lng: 89.9720 },

  // Sylhet (4)
  { name: "Habiganj", nameBn: "হবিগঞ্জ", division: "Sylhet", lat: 24.3745, lng: 91.4155 },
  { name: "Moulvibazar", nameBn: "মৌলভীবাজার", division: "Sylhet", lat: 24.4829, lng: 91.7774 },
  { name: "Sunamganj", nameBn: "সুনামগঞ্জ", division: "Sylhet", lat: 25.0658, lng: 91.3950 },
  { name: "Sylhet", nameBn: "সিলেট", division: "Sylhet", lat: 24.8949, lng: 91.8687 },

  // Rangpur (8)
  { name: "Dinajpur", nameBn: "দিনাজপুর", division: "Rangpur", lat: 25.6217, lng: 88.6354 },
  { name: "Gaibandha", nameBn: "গাইবান্ধা", division: "Rangpur", lat: 25.3288, lng: 89.5283 },
  { name: "Kurigram", nameBn: "কুড়িগ্রাম", division: "Rangpur", lat: 25.8054, lng: 89.6362 },
  { name: "Lalmonirhat", nameBn: "লালমনিরহাট", division: "Rangpur", lat: 25.9923, lng: 89.2847 },
  { name: "Nilphamari", nameBn: "নীলফামারী", division: "Rangpur", lat: 25.9317, lng: 88.856 },
  { name: "Panchagarh", nameBn: "পঞ্চগড়", division: "Rangpur", lat: 26.3411, lng: 88.5542 },
  { name: "Rangpur", nameBn: "রংপুর", division: "Rangpur", lat: 25.7439, lng: 89.2752 },
  { name: "Thakurgaon", nameBn: "ঠাকুরগাঁও", division: "Rangpur", lat: 26.0336, lng: 88.4616 },

  // Mymensingh (4)
  { name: "Jamalpur", nameBn: "জামালপুর", division: "Mymensingh", lat: 24.9375, lng: 89.9372 },
  { name: "Mymensingh", nameBn: "ময়মনসিংহ", division: "Mymensingh", lat: 24.7471, lng: 90.4203 },
  { name: "Netrokona", nameBn: "নেত্রকোণা", division: "Mymensingh", lat: 24.8103, lng: 90.8656 },
  { name: "Sherpur", nameBn: "শেরপুর", division: "Mymensingh", lat: 25.0205, lng: 90.0153 },
];

/** URL-safe slug for a district, e.g. "Cox's Bazar" -> "coxs-bazar". */
export function districtSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
