<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, polling, retention } = LEGAL;
</script>

<svelte:head>
  <title>Déontologie des sondages | {LEGAL.siteName}</title>
  <meta
    name="description"
    content="Règles méthodologiques et déontologiques appliquées par {publisher.legalName} : notice, marges d'erreur, secret des réponses, sondages électoraux."
  />
</svelte:head>

<h1>Charte de déontologie des sondages</h1>
<p>
  Engagements méthodologiques de {publisher.legalName} au titre de la loi n° 77-808 du 19 juillet 1977 modifiée
  et du {polling.code}.
</p>

<div class="note">
  <p class="!mb-0">
    <strong>Une enquête n'est jamais un argumentaire de vente.</strong> L'institut n'utilise aucun questionnaire
    comme prétexte à de la prospection commerciale ou à une collecte de dons, et ne transmet jamais les
    coordonnées d'un répondant à des fins de démarchage.
  </p>
</div>

<h2>1. Principes</h2>
<ul>
  <li><strong>Indépendance :</strong> la méthodologie est arrêtée par l'institut, jamais par le commanditaire.</li>
  <li><strong>Loyauté :</strong> les questions sont neutres et intelligibles ; aucune formulation n'induit la réponse attendue.</li>
  <li><strong>Transparence :</strong> tout résultat publié est accompagné des éléments permettant d'en juger la portée.</li>
  <li><strong>Intégrité :</strong> aucun résultat n'est modifié, tronqué ou publié de façon à en déformer le sens.</li>
</ul>

<h2>2. Constitution des échantillons</h2>
<p>
  Les échantillons sont constitués par la méthode des quotas (sexe, âge, catégorie socioprofessionnelle, région,
  catégorie d'agglomération) ou par tirage aléatoire, selon l'étude. Les redressements éventuels sont documentés
  dans la notice : leur nature, les variables concernées et leur ampleur.
</p>
<p>
  Un questionnaire ouvert à tous, diffusé par lien public ou relayé sur les réseaux sociaux, ne constitue pas un
  sondage représentatif. Les résultats issus d'une telle consultation sont publiés sous la mention explicite
  « consultation non représentative », sans marge d'erreur.
</p>

<h2>3. Notice accompagnant chaque publication</h2>
<p>Tout résultat rendu public est accompagné, sur le même support, des mentions suivantes :</p>
<ul>
  <li>le nom de l'institut ;</li>
  <li>le nom et la qualité du commanditaire et, s'il diffère, de l'acheteur du sondage ;</li>
  <li>le nombre de personnes interrogées et la méthode de constitution de l'échantillon ;</li>
  <li>les dates de recueil et le mode d'administration (en ligne, téléphone, face à face) ;</li>
  <li>les marges d'erreur associées aux résultats publiés ;</li>
  <li>le texte intégral des questions dont les résultats sont diffusés.</li>
</ul>
<p>
  La notice complète et les données de terrain sont conservées {retention.methodologyYears} ans et communiquées
  sur demande motivée.
</p>

<h2>4. Marges d'erreur</h2>
<p>
  Un sondage mesure un ordre de grandeur, pas une valeur exacte. Pour un échantillon aléatoire simple et un
  niveau de confiance de 95 %, les marges d'erreur indicatives sont les suivantes :
</p>
<table>
  <thead>
    <tr>
      <th>Taille de l'échantillon</th>
      <th>Résultat proche de 10 % ou 90 %</th>
      <th>Résultat proche de 50 %</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>500 personnes</td><td>± 2,6 points</td><td>± 4,4 points</td></tr>
    <tr><td>1 000 personnes</td><td>± 1,9 point</td><td>± 3,1 points</td></tr>
    <tr><td>2 000 personnes</td><td>± 1,3 point</td><td>± 2,2 points</td></tr>
  </tbody>
</table>
<p>
  Un écart inférieur à la marge d'erreur ne permet pas de conclure à une différence réelle, ni entre deux
  résultats d'une même vague, ni entre deux vagues successives.
</p>

<h2>5. Sondages liés à un débat électoral</h2>
{#if polling.electoralPolls}
  <p>
    Les sondages ayant un rapport direct ou indirect avec un débat électoral sont soumis à la loi du 19 juillet
    1977 et au contrôle de la
    <a href={polling.commissionUrl} rel="noopener noreferrer" target="_blank">commission des sondages</a>.
    L'institut s'engage à :
  </p>
  <ul>
    <li>déposer auprès de la commission, au plus tard lors de la première publication, la notice précisant l'objet du sondage, la méthode, les redressements et le texte des questions ;</li>
    <li>ne publier ni diffuser aucun sondage électoral à compter de la veille du scrutin à minuit et jusqu'à la fermeture du dernier bureau de vote en métropole ;</li>
    <li>publier sans délai et dans les mêmes conditions toute mise au point demandée par la commission des sondages ;</li>
    <li>ne pas présenter comme un sondage une consultation dépourvue de méthode d'échantillonnage.</li>
  </ul>
{:else}
  <p>
    L'institut ne réalise ni ne publie de sondage ayant un rapport direct ou indirect avec un débat électoral. Si
    cette activité devait être engagée, les obligations de la loi du 19 juillet 1977 et le contrôle de la
    commission des sondages s'appliqueraient de plein droit.
  </p>
{/if}

<h2>6. Secret des réponses individuelles</h2>
<p>
  Les réponses ne sont jamais livrées nominativement. Les commanditaires reçoivent des résultats agrégés ;
  lorsqu'un verbatim est restitué, il l'est sans élément permettant d'identifier son auteur. Aucun croisement
  n'est publié lorsqu'il conduirait à isoler un effectif trop faible pour préserver l'anonymat.
</p>
<p>
  Les données d'identification sont séparées des réponses dès la fin du terrain, et les données brutes
  identifiantes sont anonymisées au plus tard {retention.rawSurveyMonths} mois après la clôture de l'enquête.
  Le détail figure dans la <a href="/legal/confidentialite">politique de confidentialité</a>.
</p>

<h2>7. Respect des personnes interrogées</h2>
<ul>
  <li>la participation est libre : personne n'est tenu de répondre, ni de justifier un refus ;</li>
  <li>une enquête peut être interrompue à tout moment, sans conséquence ;</li>
  <li>l'objet de l'étude, la durée approximative et l'identité de l'institut sont annoncés avant le questionnaire ;</li>
  <li>aucune personne de moins de quinze ans n'est interrogée sans l'autorisation du titulaire de l'autorité parentale ;</li>
  <li>les questions portant sur des données sensibles (opinions politiques, convictions, santé) sont facultatives et signalées comme telles.</li>
</ul>

<h2>8. Sous-traitance et prestataires de terrain</h2>
<p>
  Lorsqu'une partie du terrain est confiée à un prestataire (fournisseur de panel, plateforme de recueil), celui-ci
  est tenu contractuellement aux mêmes exigences de confidentialité et de déontologie, et ne peut réutiliser les
  données pour son compte.
</p>

<h2>9. Signaler un manquement</h2>
<p>
  Toute contestation portant sur un sondage publié peut être adressée à
  <a href="mailto:{publisher.email}">{publisher.email}</a> ; une réponse motivée est apportée sous un mois.
  {#if polling.electoralPolls}
    S'agissant d'un sondage électoral, la commission des sondages peut également être saisie directement.
  {/if}
</p>
