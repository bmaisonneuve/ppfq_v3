import { HomeScreen } from '@/ui/game/home-screen'

/**
 * L'aperçu d'une journée passée : les trois niveaux, leur état, l'invitation à
 * reprendre celui qui est en cours.
 *
 * Le même écran que l'accueil du jour, et c'est tout ce que ce fichier a à
 * dire : « la mécanique de jeu en archive est identique à celle du quotidien »
 * (specs §7), donc il n'y a pas de second sommaire à écrire. Ce qui diffère est
 * porté par `base` — d'où partent les liens — et par les trois retenues que
 * `game-provider.tsx` énumère : ni série, ni résumé partagé, ni compte à
 * rebours.
 *
 * La grille et le droit d'y jouer sont lus par le layout, qui les partage avec
 * les trois écrans de niveau.
 */
export default function ArchiveGridPage() {
  return <HomeScreen />
}
