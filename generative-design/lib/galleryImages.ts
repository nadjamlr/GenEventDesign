export type GalleryImage = {
  id: string;
  label: string;
  src: string;
};

// Bilder aus public/image – stehen bei Bild-Areas direkt zur Auswahl, ohne
// dass man sie hochladen muss. Lege weitere Dateien einfach in public/image
// ab und trag sie hier ein.
export const GALLERY_IMAGES: GalleryImage[] = [
  { id: "halfpipe_bw", label: "Halfpipe", src: "/image/halfpipe_bw.jpg" },
  { id: "rassvet_clrd", label: "Rassvet", src: "/image/rassvet_clrd.jpg" },
  { id: "rassvet_clrd_ollie", label: "Rassvet Ollie", src: "/image/rassvet_clrd_ollie.jpg" },
  { id: "rassvet_stairs_clrd", label: "Rassvet Stairs", src: "/image/rassvet_stairs_clrd.jpg" },
];
