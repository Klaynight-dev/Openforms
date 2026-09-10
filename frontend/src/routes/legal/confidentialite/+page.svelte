<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, dpo, retention, host } = LEGAL;
</script>

<svelte:head>
  <title>Politique de confidentialité | {LEGAL.siteName}</title>
  <meta
    name="description"
    content="Données collectées lors des enquêtes de {publisher.legalName}, finalités, durées de conservation et droits RGPD."
  />
</svelte:head>

<h1>Politique de confidentialité</h1>
<p>
  Information des personnes interrogées au titre des articles 12 à 14 du règlement (UE) 2016/679 (RGPD) et de la
  loi n° 78-17 du 6 janvier 1978 modifiée.
</p>

<div class="note">
  <p class="!mb-0">
    <strong>Vos réponses ne sont jamais livrées à votre nom.</strong> Les commanditaires d'une enquête reçoivent
    des résultats agrégés. Vos coordonnées servent à vous inviter et à vérifier l'unicité de votre participation :
    elles ne sont ni vendues, ni louées, ni utilisées pour du démarchage.
  </p>
</div>

<h2>1. Responsable de traitement</h2>
<ul>
  <li>{publisher.legalName}, {publisher.form}, RNA {publisher.rna}</li>
  <li>{publisher.address}</li>
  <li>Contact : <a href="mailto:{publisher.email}">{publisher.email}</a></li>
  {#if dpo.designated}
    <li>Délégué à la protection des données : <a href="mailto:{dpo.email}">{dpo.email}</a></li>
  {:else}
    <li>Aucun délégué à la protection des données n'est désigné ; les demandes sont traitées à l'adresse ci-dessus.</li>
  {/if}
</ul>
<p>
  L'Institut est responsable de traitement pour son panel, pour la conduite de ses enquêtes et pour le
  fonctionnement du site. Lorsqu'un commanditaire fournit lui-même le fichier des personnes à interroger, il
  reste responsable de ce fichier et l'Institut agit comme sous-traitant (art. 28 RGPD) pour la phase de terrain.
</p>

<h2>2. Données traitées et finalités</h2>
<table>
  <thead>
    <tr>
      <th>Traitement</th>
      <th>Données</th>
      <th>Base légale</th>
      <th>Conservation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Réponses aux enquêtes</td>
      <td>Réponses au questionnaire, variables de quota (âge, sexe, région, catégorie socioprofessionnelle), fichiers joints, date de participation</td>
      <td>Intérêt légitime à produire des études statistiques, avec les garanties de l'art. 89 RGPD, ou consentement lorsque le questionnaire l'exige</td>
      <td>Données identifiantes anonymisées au plus tard {retention.rawSurveyMonths} mois après la clôture du terrain</td>
    </tr>
    <tr>
      <td>Questions sensibles</td>
      <td>Opinions politiques, convictions, appartenance syndicale, santé, orientation sexuelle</td>
      <td>Consentement explicite (art. 9.2.a) : ces questions sont toujours facultatives et signalées comme telles</td>
      <td>Identique aux réponses, avec anonymisation prioritaire</td>
    </tr>
    <tr>
      <td>Gestion du panel</td>
      <td>Nom, adresse électronique, profil sociodémographique, historique des participations, gratifications versées</td>
      <td>Exécution de la relation panéliste (art. 6.1.b) et consentement à être sollicité</td>
      <td>{retention.panelInactivityMonths} mois après le dernier contact</td>
    </tr>
    <tr>
      <td>Traçabilité du terrain</td>
      <td>Empreinte de l'adresse IP et agent utilisateur, pour écarter les réponses automatisées et les doublons. <strong>Non collectés</strong> lorsque l'enquête est configurée comme anonyme</td>
      <td>Intérêt légitime : qualité et sincérité de l'échantillon (art. 6.1.f)</td>
      <td>Supprimés avec les données brutes de l'enquête</td>
    </tr>
    <tr>
      <td>Notice méthodologique et archives</td>
      <td>Questionnaire, plan d'échantillonnage, redressements, résultats agrégés</td>
      <td>Obligation légale pour les sondages électoraux, intérêt légitime pour les autres</td>
      <td>{retention.methodologyYears} ans ; les jeux anonymisés peuvent être conservés sans limite à des fins statistiques</td>
    </tr>
    <tr>
      <td>Comptes des chargés d'études</td>
      <td>Adresse électronique, nom affiché, mot de passe (empreinte irréversible), rôle</td>
      <td>Intérêt légitime : sécuriser l'accès aux données d'enquête (art. 6.1.f)</td>
      <td>Durée du compte, puis {retention.inactiveAccountMonths} mois d'inactivité</td>
    </tr>
    <tr>
      <td>Sessions et journaux techniques</td>
      <td>Jeton de session haché, empreinte d'IP, agent utilisateur, horodatage et chemin des requêtes</td>
      <td>Intérêt légitime : sécurité du système (art. 6.1.f)</td>
      <td>{retention.sessionDays} jours pour les sessions, 12 mois au plus pour les journaux</td>
    </tr>
  </tbody>
</table>

<h2>3. Séparation des identités et des réponses</h2>
<p>
  Dès la clôture du terrain, les données permettant d'identifier une personne sont dissociées de ses réponses et
  conservées séparément, sous accès restreint. Les traitements statistiques sont réalisés sur les seules réponses.
  Aucune tentative de réidentification n'est effectuée, et aucun croisement n'est publié lorsqu'il conduirait à
  isoler un effectif trop faible pour préserver l'anonymat.
</p>

<h2>4. Ce que reçoit le commanditaire</h2>
<p>
  Le commanditaire d'une enquête reçoit des tableaux de résultats agrégés et, le cas échéant, des réponses libres
  expurgées de tout élément identifiant. Il ne reçoit ni nom, ni adresse électronique, ni identifiant technique
  permettant de remonter à une personne. Les modalités correspondantes figurent dans la
  <a href="/legal/deontologie">charte de déontologie</a>.
</p>

<h2>5. Absence de prospection</h2>
<p>
  Les coordonnées recueillies dans le cadre d'une enquête ne sont jamais utilisées pour vendre un produit,
  solliciter un don ou constituer un fichier de démarchage, ni par l'Institut, ni par un tiers. Une enquête n'est
  jamais un préalable déguisé à une offre commerciale.
</p>

<h2>6. Caractère facultatif des réponses</h2>
<p>
  Répondre est toujours volontaire. Un questionnaire peut être interrompu à tout moment ; les réponses déjà
  saisies sont alors écartées de l'analyse, sauf indication contraire annoncée avant le début du terrain. Les
  questions marquées comme obligatoires conditionnent uniquement l'envoi du questionnaire.
</p>

<h2>7. Mineurs</h2>
<p>
  Aucune personne de moins de quinze ans n'est interrogée sans l'autorisation du titulaire de l'autorité
  parentale, laquelle est recueillie avant le questionnaire et peut être retirée à tout moment.
</p>

<h2>8. Destinataires et sous-traitants</h2>
<ul>
  <li>les chargés d'études de l'Institut habilités sur l'enquête concernée, et eux seuls ;</li>
  <li>
    l'hébergeur {host.name} ({host.dataCenter}), en qualité de sous-traitant technique, sans accès aux contenus
    en dehors des opérations d'infrastructure ;
  </li>
  <li>le service d'envoi de courriels utilisé pour les invitations, relances et accusés de réception ;</li>
  <li>le cas échéant, un prestataire de terrain ou fournisseur de panel, tenu aux mêmes obligations contractuelles de confidentialité ;</li>
  <li>
    un service tiers destinataire d'un webhook, lorsqu'une enquête en comporte un : les réponses sont alors
    transmises à l'adresse configurée, sous la responsabilité de l'entité qui l'a paramétrée.
  </li>
</ul>
<p>
  Aucune donnée n'est transférée hors de l'Union européenne. Si un transfert devenait nécessaire, il serait
  encadré par les clauses contractuelles types de la Commission européenne et signalé dans la présente politique.
</p>

<h2>9. Sécurité</h2>
<ul>
  <li>chiffrement des échanges en HTTPS ;</li>
  <li>mots de passe stockés sous forme d'empreintes irréversibles, jamais en clair ;</li>
  <li>chiffrement optionnel des réponses au repos (AES-256-GCM), activable enquête par enquête ;</li>
  <li>adresses IP conservées uniquement sous forme d'empreinte, jamais en clair ;</li>
  <li>cookie de session <em>HttpOnly</em> et protection anti-CSRF sur toutes les écritures ;</li>
  <li>limitation de débit sur l'authentification et sur la soumission des questionnaires ;</li>
  <li>fichiers joints stockés hors racine web, sous un nom aléatoire, servis uniquement aux chargés d'études habilités ;</li>
  <li>accès aux données de terrain restreint aux personnes concourant à l'étude.</li>
</ul>

<h2>10. Vos droits</h2>
<p>
  Toute personne dispose d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de
  portabilité, du droit de retirer son consentement à tout moment, ainsi que du droit de définir des directives
  relatives au sort de ses données après son décès.
</p>
<ul>
  <li>
    <strong>Opposition :</strong> vous pouvez vous opposer à tout moment à être sollicité par l'Institut et
    demander votre retrait du panel, sans avoir à motiver votre demande.
  </li>
  <li>
    <strong>Accès et effacement :</strong> ces droits s'exercent tant que vos réponses n'ont pas été anonymisées.
    Une fois l'anonymisation réalisée, les données ne permettent plus de vous identifier et ne peuvent donc plus
    être retrouvées (art. 11 RGPD).
  </li>
  <li>
    <strong>Enquête commandée par un tiers :</strong> lorsque le fichier de contacts provient d'un commanditaire,
    votre demande lui est transmise et il vous est indiqué à qui vous adresser.
  </li>
</ul>
<p>
  Les demandes sont à adresser à <a href="mailto:{publisher.email}">{publisher.email}</a>. Une réponse est
  apportée dans un délai d'un mois, prolongeable de deux mois en cas de demande complexe. En cas de réponse
  insatisfaisante, une réclamation peut être introduite auprès de la CNIL : 3 place de Fontenoy, TSA 80715, 75334
  Paris Cedex 07, <a href="https://www.cnil.fr/fr/plaintes" rel="noopener noreferrer" target="_blank">www.cnil.fr/fr/plaintes</a>.
</p>

<h2>11. Décisions automatisées</h2>
<p>
  Aucune décision produisant des effets juridiques n'est prise de façon automatisée. Les contrôles de qualité
  (détection des réponses en série ou incohérentes) peuvent conduire à écarter une participation de l'analyse ;
  cette décision est réexaminée sur demande.
</p>

<h2>12. Violation de données</h2>
<p>
  En cas de violation susceptible d'engendrer un risque pour les droits et libertés des personnes, la CNIL est
  notifiée dans les 72 heures et les personnes concernées sont informées lorsque le risque est élevé.
</p>

<h2>13. Ressources externes</h2>
<p>
  Les pages du site chargent la police de caractères « Outfit » depuis Google Fonts, ce qui transmet l'adresse IP
  du visiteur à Google. Cette dépendance a vocation à être internalisée ; son blocage par le navigateur n'empêche
  pas de répondre à un questionnaire, seule la police de repli change.
</p>

<h2>14. Modification de la présente politique</h2>
<p>
  La présente politique peut être mise à jour pour refléter une évolution des traitements ou de la
  réglementation. La date de dernière révision figure en bas de page.
</p>
