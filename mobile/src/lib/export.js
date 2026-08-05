import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobVersBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Enregistre un blob binaire (docx/xlsx) dans le cache de l'app et ouvre le
 * menu de partage natif Android pour l'exporter (WhatsApp, e-mail, Drive...). */
export async function partagerFichierBinaire(blob, nomFichier, titre) {
  const base64 = await blobVersBase64(blob);
  const res = await Filesystem.writeFile({
    path: nomFichier, data: base64, directory: Directory.Cache,
  });
  await Share.share({ title: titre || nomFichier, url: res.uri });
}
