const TUİK_URL =
  "https://nip.tuik.gov.tr/Home/GetInformation";

const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://nip.tuik.gov.tr/",
  "User-Agent": "Mozilla/5.0"
};


// Türkçe karakterleri normalize eder
function normalize(text) {
  return String(text || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
}


// TÜİK'in 1.956.428 şeklindeki sayısını 1956428 yapar
function parseNumber(text) {
  return Number(
    String(text)
      .replace(/\./g, "")
      .replace(/,/g, "")
      .replace(/\s/g, "")
  );
}


// Basit HTML tablo parser
function parseTable(html) {

  const tableMatch = html.match(
    /<table[^>]*id=["']tableCiGoNu["'][^>]*>([\s\S]*?)<\/table>/i
  );

  if (!tableMatch) {
    return [];
  }

  const table = tableMatch[1];

  const rowMatches = table.match(
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  ) || [];

  const results = [];

  for (const row of rowMatches) {

    const cells = row.match(
      /<td[^>]*>([\s\S]*?)<\/td>/gi
    );

    if (!cells || cells.length !== 5) {
      continue;
    }

    const values = cells.map(cell => {

      return cell
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

    });

    const yil = Number(values[0]);

    if (!Number.isInteger(yil)) {
      continue;
    }

    results.push({
      yil,
      il: values[1],
      toplam: parseNumber(values[2]),
      erkek: parseNumber(values[3]),
      kadin: parseNumber(values[4])
    });
  }

  return results;
}


export default async function handler(req, res) {

  // Sadece POST
  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Sadece POST metodu kullanılabilir."
    });

  }


  const body = req.body || {};

  const cinsiyetRaw = body.Cinsiyet ?? "";
  const ilRaw = body.IL ?? "";
  const yilRaw = body.Yil ?? "";


  const cinsiyet = normalize(cinsiyetRaw);
  const il = String(ilRaw).trim();

  // -----------------------------
  // CİNSİYET KONTROLÜ
  // -----------------------------

  let cinsiyetValue = "";

  if (
    cinsiyet === "erkek" ||
    cinsiyet === "male"
  ) {

    cinsiyetValue = "erkek";

  } else if (
    cinsiyet === "kadın" ||
    cinsiyet === "kadin" ||
    cinsiyet === "female"
  ) {

    cinsiyetValue = "kadın";

  } else if (cinsiyet !== "") {

    return res.status(400).json({
      success: false,
      error: "Cinsiyet Erkek, Kadın veya boş olmalıdır."
    });

  }


  // -----------------------------
  // YIL KONTROLÜ
  // -----------------------------

  let yil = null;

  if (
    yilRaw !== "" &&
    yilRaw !== null &&
    yilRaw !== undefined
  ) {

    yil = Number(yilRaw);

    if (!Number.isInteger(yil)) {

      return res.status(400).json({
        success: false,
        error: "Yil sayı olmalıdır."
      });

    }

  }


  // -----------------------------
  // TÜİK İSTEĞİ
  // -----------------------------

  const params = new URLSearchParams();

  params.append("status", "1");
  params.append("name", "CinsiyeteGoreNufus");
  params.append(
    "value",
    il ? il.toLocaleUpperCase("tr-TR") : ""
  );


  let response;

  try {

    response = await fetch(TUİK_URL, {
      method: "POST",
      headers: HEADERS,
      body: params.toString()
    });

  } catch (error) {

    return res.status(502).json({
      success: false,
      error: "TÜİK sunucusuna ulaşılamadı."
    });

  }


  if (!response.ok) {

    return res.status(502).json({
      success: false,
      error: "TÜİK sunucusu hata döndürdü.",
      status: response.status
    });

  }


  const html = await response.text();

  const data = parseTable(html);


  // -----------------------------
  // VERİ KONTROLÜ
  // -----------------------------

  if (!data.length) {

    return res.status(404).json({
      success: false,
      error: "İl bulunamadı veya veri alınamadı."
    });

  }


  // -----------------------------
  // YIL FİLTRESİ
  // -----------------------------

  let filtered = data;

  if (yil !== null) {

    filtered = data.filter(
      item => item.yil === yil
    );

  }


  if (!filtered.length) {

    return res.status(404).json({
      success: false,
      error: "İstenen yıl için veri bulunamadı."
    });

  }


  // -----------------------------
  // CİNSİYET FİLTRESİ
  // -----------------------------

  let sonuc;


  if (cinsiyetValue === "erkek") {

    sonuc = filtered.map(item => ({
      yil: item.yil,
      il: item.il,
      nufus: item.erkek
    }));

  }

  else if (cinsiyetValue === "kadın") {

    sonuc = filtered.map(item => ({
      yil: item.yil,
      il: item.il,
      nufus: item.kadin
    }));

  }

  else {

    sonuc = filtered.map(item => ({
      yil: item.yil,
      il: item.il,
      toplam: item.toplam,
      erkek: item.erkek,
      kadin: item.kadin
    }));

  }


  // -----------------------------
  // TEK YIL İSTENDİYSE
  // -----------------------------

  if (yil !== null && sonuc.length === 1) {

    return res.status(200).json({
      success: true,
      il: il
        ? il.toLocaleUpperCase("tr-TR")
        : "TÜRKİYE",
      cinsiyet:
        cinsiyetValue === "erkek"
          ? "Erkek"
          : cinsiyetValue === "kadın"
            ? "Kadın"
            : "Hepsi",
      yil,
      ...sonuc[0]
    });

  }


  // -----------------------------
  // TÜM YILLAR
  // -----------------------------

  return res.status(200).json({
    success: true,
    il: il
      ? il.toLocaleUpperCase("tr-TR")
      : "TÜRKİYE",
    cinsiyet:
      cinsiyetValue === "erkek"
        ? "Erkek"
        : cinsiyetValue === "kadın"
          ? "Kadın"
          : "Hepsi",
    yil: yil ?? "Hepsi",
    veri: sonuc
  });

}
