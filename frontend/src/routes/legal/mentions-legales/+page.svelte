<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, host, source } = LEGAL;
</script>

<svelte:head>
  <title>Mentions légales | {LEGAL.siteName}</title>
  <meta name="description" content="Éditeur, directeur de publication et hébergeur du service {LEGAL.siteName}." />
</svelte:head>

<h1>Mentions légales</h1>
<p>Informations prévues par l'article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).</p>

<h2>1. Éditeur du site</h2>
<ul>
  <li><strong>Dénomination :</strong> {publisher.legalName}</li>
  <li><strong>Forme juridique :</strong> {publisher.form}</li>
  <li><strong>Numéro RNA :</strong> {publisher.rna}</li>
  <li><strong>Siège social :</strong> {publisher.address}</li>
  <li><strong>Déclaration :</strong> {publisher.declaration}</li>
  <li><strong>Contact :</strong> <a href="mailto:{publisher.email}">{publisher.email}</a>{#if publisher.phone}, {publisher.phone}{/if}</li>
</ul>

<h2>2. Directeur de la publication</h2>
<p>{publisher.publicationDirector}, en qualité de représentant légal de l'association.</p>

<h2>3. Hébergement</h2>
<p>Le site et la base de données sont hébergés par :</p>
<ul>
  <li><strong>Hébergeur :</strong> {host.name}</li>
  <li><strong>Adresse :</strong> {host.address}</li>
  <li><strong>Téléphone :</strong> {host.phone}</li>
</ul>
<p>Les données sont hébergées sur des serveurs situés dans l'Union européenne.</p>

<h2>4. Propriété intellectuelle</h2>
<p>
  Le code source du service est publié sous licence {source.license} et disponible à l'adresse
  <a href={source.repository} rel="noopener noreferrer" target="_blank">{source.repository}</a>. Chacun peut
  le réutiliser, le modifier et le redistribuer dans les conditions de cette licence.
</p>
<p>
  En revanche, la dénomination, le logo et les contenus éditoriaux propres à {publisher.legalName} restent la
  propriété de l'association et ne peuvent être repris sans son accord écrit préalable. Les contenus des
  formulaires publiés via le service appartiennent à leurs auteurs respectifs.
</p>

<h2>5. Contenus publiés par les utilisateurs</h2>
<p>
  Les formulaires sont créés et diffusés par des administrateurs disposant d'un compte. L'éditeur agit à leur
  égard comme un prestataire technique et n'exerce pas de contrôle a priori sur leur contenu. Tout contenu
  illicite peut être signalé à <a href="mailto:{publisher.email}">{publisher.email}</a> ; il sera retiré
  promptement après vérification.
</p>

<h2>6. Accessibilité</h2>
<p>
  Le service vise la conformité au RGAA : navigation clavier complète, libellés de champs explicites, respect
  de la préférence <em>prefers-reduced-motion</em> et contrastes conformes au niveau AA. Toute difficulté
  d'accès rencontrée peut être signalée à l'adresse de contact ci-dessus.
</p>

<h2>7. Signalement et réclamation</h2>
<p>
  Pour toute question relative au présent site, écrivez à <a href="mailto:{publisher.email}">{publisher.email}</a>.
  Les demandes relatives aux données personnelles sont traitées selon la
  <a href="/legal/confidentialite">politique de confidentialité</a>.
</p>
