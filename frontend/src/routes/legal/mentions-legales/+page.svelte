<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, host, source, polling } = LEGAL;
</script>

<svelte:head>
  <title>Mentions légales | {LEGAL.siteName}</title>
  <meta name="description" content="Éditeur, directeur de publication et hébergeur de {LEGAL.siteName}, institut d'études et de sondages." />
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
  <li><strong>Activité :</strong> {LEGAL.activity}</li>
  <li><strong>Contact :</strong> <a href="mailto:{publisher.email}">{publisher.email}</a>{#if publisher.phone}, {publisher.phone}{/if}</li>
</ul>

<h2>2. Directeur de la publication</h2>
<p>{publisher.publicationDirector}, en qualité de représentant légal de l'association.</p>

<h2>3. Hébergement</h2>
<p>Le site, la base de données et les fichiers collectés sont hébergés par :</p>
<ul>
  <li><strong>Hébergeur :</strong> {host.name}</li>
  <li><strong>Adresse :</strong> {host.address}</li>
  <li><strong>Téléphone :</strong> {host.phone}</li>
  <li><strong>Site :</strong> <a href={host.website} rel="noopener noreferrer" target="_blank">{host.website}</a></li>
  <li><strong>Localisation des serveurs :</strong> {host.dataCenter}</li>
</ul>

<h2>4. Cadre applicable à l'activité de sondage</h2>
<p>
  En sa qualité d'institut d'études et de sondages, l'éditeur est soumis, outre le RGPD, aux règles suivantes :
</p>
<ul>
  <li>
    la loi n° 77-808 du 19 juillet 1977 modifiée, relative à la publication et à la diffusion de certains
    sondages d'opinion, pour tout sondage ayant un rapport direct ou indirect avec un débat électoral ;
  </li>
  <li>
    le contrôle de la commission des sondages, à laquelle est déposée la notice méthodologique de chaque sondage
    de cette nature :
    <a href={polling.commissionUrl} rel="noopener noreferrer" target="_blank">{polling.commissionUrl}</a> ;
  </li>
  <li>
    le {polling.code}, dont l'éditeur s'engage à respecter les règles{#if !polling.esomarMember} sans se prévaloir d'une adhésion formelle{/if}.
  </li>
</ul>
<p>
  Les engagements méthodologiques et déontologiques correspondants sont détaillés dans la
  <a href="/legal/deontologie">charte de déontologie des sondages</a>.
</p>

<h2>5. Propriété intellectuelle</h2>
<p>
  Le logiciel qui fait fonctionner le site est publié sous licence {source.license} et disponible à l'adresse
  <a href={source.repository} rel="noopener noreferrer" target="_blank">{source.repository}</a>. Chacun peut le
  réutiliser, le modifier et le redistribuer dans les conditions de cette licence.
</p>
<p>
  En revanche, la dénomination, le logo, les questionnaires, les méthodologies d'échantillonnage et de
  redressement, ainsi que les résultats et analyses publiés par l'éditeur, restent sa propriété. Toute reprise
  de résultats doit citer l'institut, le commanditaire, la taille de l'échantillon et les dates de terrain,
  conformément à la charte de déontologie.
</p>

<h2>6. Contenus publiés par les tiers</h2>
<p>
  Certaines enquêtes sont administrées pour le compte d'un commanditaire, qui en définit le contenu. Tout
  contenu qui paraîtrait illicite peut être signalé à
  <a href="mailto:{publisher.email}">{publisher.email}</a> ; il sera examiné et, le cas échéant, retiré
  promptement.
</p>

<h2>7. Accessibilité</h2>
<p>
  Le service vise la conformité au RGAA : navigation clavier complète, libellés de questions explicites, respect
  de la préférence <em>prefers-reduced-motion</em> et contrastes conformes au niveau AA. Toute difficulté d'accès
  à un questionnaire peut être signalée à l'adresse de contact ci-dessus, afin qu'un mode de réponse alternatif
  soit proposé.
</p>

<h2>8. Réclamations</h2>
<p>
  Pour toute question relative au présent site, écrivez à <a href="mailto:{publisher.email}">{publisher.email}</a>.
  Les demandes relatives aux données personnelles sont traitées selon la
  <a href="/legal/confidentialite">politique de confidentialité</a> ; les contestations portant sur un sondage
  publié relèvent de la <a href="/legal/deontologie">charte de déontologie</a> et, pour les sondages électoraux,
  de la commission des sondages.
</p>
