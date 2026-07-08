/**
 * Registre central des icônes de l'application.
 *
 * Politique : **Phosphor** (`phosphor-svelte`) est le jeu principal. Lorsqu'une
 * icône adéquate n'existe pas dans Phosphor, on retombe sur **Lucide**
 * (`@lucide/svelte`) — ex. `Sigma` pour l'agrégation de colonnes du tableur.
 *
 * Tous les composants importent leurs icônes depuis ce fichier afin de garder
 * un style cohérent et un point de bascule unique.
 */
import {
  MagnifyingGlass,
  Plus,
  Trash,
  Copy,
  DotsSixVertical,
  Paperclip,
  UploadSimple,
  DownloadSimple,
  Check,
  CheckCircle,
  LinkSimple,
  Lock,
  Eye,
  User,
  Users,
  Gear,
  SignOut,
  Key,
  X,
  CaretDown,
  SortAscending,
  SortDescending,
  PencilSimple,
  FloppyDisk,
  ArrowLeft,
  ArrowSquareOut,
  ShieldCheck,
  Table,
  Plant,
  Warning,
  FileArrowUp,
  MicrosoftExcelLogo,
  TextT,
  TextAlignLeft,
  EnvelopeSimple,
  Hash,
  RadioButton,
  CheckSquare,
  CaretCircleDown,
  CalendarBlank,
  Clock,
  GridFour,
} from "phosphor-svelte";

// Fallback Lucide (icône absente/peu claire côté Phosphor).
import { Sigma } from "@lucide/svelte";

import type { FieldType } from "./types.ts";

// --- Icônes sémantiques (principal : Phosphor) ---
export {
  MagnifyingGlass as IconSearch,
  Plus as IconPlus,
  Trash as IconTrash,
  Copy as IconDuplicate,
  DotsSixVertical as IconDrag,
  Paperclip as IconAttach,
  UploadSimple as IconUpload,
  DownloadSimple as IconDownload,
  Check as IconCheck,
  CheckCircle as IconCheckCircle,
  LinkSimple as IconLink,
  Lock as IconLock,
  Eye as IconEye,
  User as IconUser,
  Users as IconUsers,
  Gear as IconSettings,
  SignOut as IconLogout,
  Key as IconKey,
  X as IconClose,
  CaretDown as IconCaretDown,
  SortAscending as IconSortAsc,
  SortDescending as IconSortDesc,
  PencilSimple as IconEdit,
  FloppyDisk as IconSave,
  ArrowLeft as IconBack,
  ArrowSquareOut as IconExternal,
  ShieldCheck as IconShield,
  Table as IconTable,
  Plant as IconLeaf,
  Warning as IconWarning,
  FileArrowUp as IconImport,
  MicrosoftExcelLogo as IconExcel,
};

// --- Fallback Lucide ---
export { Sigma as IconFormula };

/** Composant d'icône associé à chaque type de champ (palette du builder). */
export const FIELD_ICONS: Record<FieldType, typeof TextT> = {
  short_text: TextT,
  paragraph: TextAlignLeft,
  email: EnvelopeSimple,
  number: Hash,
  radio: RadioButton,
  checkbox: CheckSquare,
  select: CaretCircleDown,
  date: CalendarBlank,
  datetime: Clock,
  file: Paperclip,
  grid: GridFour,
};
