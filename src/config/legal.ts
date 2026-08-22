/**
 * Legal texts (Datenschutzerklärung, Haftungsausschluss).
 *
 * The Impressum itself is *not* maintained here: it is hosted by
 * online-impressum.de, and the sidebar's "Impressum" entry links to it
 * directly, so it stays correct without a redeploy. See `imprintUrl` below.
 *
 * German law requires an Impressum to be "leicht erkennbar, unmittelbar
 * erreichbar und ständig verfügbar" (§ 5 DDG), which is why it is a direct,
 * always-visible sidebar link rather than something buried in a dialog.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Values marked with `TODO:` are still placeholders; the Legal view renders a
 * loud warning banner while any remain, instead of pretending the texts are
 * valid.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This is a template, not legal advice. Have it checked if the project ever
 * stops being a private, non-commercial side project.
 */

export type LegalLocale = 'de' | 'en'

/** Marker for values that must be filled in before deployment. */
const TODO = 'TODO:'

/**
 * Externally hosted Impressum, linked directly from the sidebar's "Impressum"
 * entry (opens in a new tab). Single source of truth for the § 5 DDG details —
 * edit it at online-impressum.de, not here.
 */
export const imprintUrl = 'https://mein.online-impressum.de/baugraph/'

/**
 * Site operator — the natural person behind a private, non-commercial site.
 * Mirrors the hosted Impressum, because the GDPR wants the controller named in
 * the privacy policy itself rather than by reference.
 */
export const operator = {
  name: 'Til Schwarze',
  street: 'c/o Online-Impressum #10198, Europaring 90',
  postalCode: '53757',
  city: 'St. Augustin',
  country: 'Deutschland',
  email: 'baugraph@mail.online-impressum.de',
  /** Optional. Leave empty to omit the line; e-mail alone satisfies § 5 DDG. */
  phone: '',
}

export const site = {
  name: 'Baugraph',
  /** Public URL, used in the privacy policy. */
  url: 'https://baugraph.com/',
}

/** Where the static build is served from — a processor under Art. 28 GDPR. */
export const hosting = {
  provider: 'GitHub Pages',
  company: 'GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA',
  privacyUrl:
    'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
}

/**
 * Data protection authority of the operator's Bundesland (Art. 77 GDPR).
 * Optional — the generic right to complain is stated either way.
 */
export const supervisoryAuthority = {
  name: '',
  url: '',
}

/**
 * `src/style.css` pulls Geist from fonts.googleapis.com at runtime, which sends
 * the visitor's IP to Google. Self-host the font files and set this to `false`
 * to drop both the transfer and the disclosure section below.
 */
export const usesGoogleFonts = true

/** Shown as "Stand" / "Last updated". ISO date. */
export const lastUpdated = '2026-08-12'

/** True while any placeholder is still unresolved. */
export const hasPlaceholders = [
  ...Object.values(operator),
  ...Object.values(site),
].some(value => value.startsWith(TODO))

export interface LegalBlock {
  heading?: string
  /** Prose paragraphs. */
  paragraphs?: string[]
  /** Tight, unbulleted lines — addresses and contact details. */
  lines?: string[]
  /** Bulleted list. */
  list?: string[]
}

export interface LegalDocument {
  id: string
  /** Tab label. */
  label: string
  title: string
  blocks: LegalBlock[]
}

const address = [
  operator.name,
  operator.street,
  `${operator.postalCode} ${operator.city}`,
  operator.country,
]

const contact = [
  `E-Mail: ${operator.email}`,
  ...(operator.phone ? [`Telefon: ${operator.phone}`] : []),
]

const contactEn = [
  `E-mail: ${operator.email}`,
  ...(operator.phone ? [`Phone: ${operator.phone}`] : []),
]

const de: LegalDocument[] = [
  {
    id: 'privacy',
    label: 'Datenschutz',
    title: 'Datenschutzerklärung',
    blocks: [
      {
        heading: 'Kurz gefasst',
        paragraphs: [
          `${site.name} läuft vollständig in Ihrem Browser. Diagramme, die Sie anlegen, werden `
          + 'nicht an einen Server übertragen, sondern ausschließlich lokal in Ihrem Browser '
          + 'gespeichert. Es gibt keine Benutzerkonten, keine Kontaktformulare, keine Analyse- '
          + 'oder Tracking-Werkzeuge und keine Werbung.',
        ],
      },
      {
        heading: 'Verantwortlicher im Sinne der DSGVO',
        lines: [...address, ...contact],
      },
      {
        heading: 'Hosting und Server-Logfiles',
        paragraphs: [
          `Diese Website wird bei ${hosting.provider} gehostet. Anbieter ist ${hosting.company}.`,
          'Beim Aufruf der Seite verarbeitet der Hoster automatisch übermittelte Daten in '
          + 'Server-Logfiles. Dazu gehören insbesondere IP-Adresse, Datum und Uhrzeit des '
          + 'Zugriffs, die aufgerufene Datei, übertragene Datenmenge, Referrer-URL sowie Browser- '
          + 'und Betriebssystemkennung. Diese Verarbeitung ist technisch erforderlich, um die '
          + 'Website auszuliefern und ihren Betrieb abzusichern.',
          'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in der '
          + 'technisch fehlerfreien Bereitstellung und der Sicherheit der Website. Eine Zusammen'
          + 'führung dieser Daten mit anderen Datenquellen findet nicht statt; ich selbst habe '
          + 'keinen Zugriff auf die Logfiles.',
          'Die Verarbeitung findet auch auf Servern in den USA statt. Einzelheiten zur '
          + 'Datenverarbeitung sowie die Grundlagen der Übermittlung in Drittländer '
          + '(Angemessenheitsbeschluss zum EU-U.S. Data Privacy Framework bzw. '
          + `Standardvertragsklauseln) entnehmen Sie der Datenschutzerklärung des Hosters: `
          + `${hosting.privacyUrl}`,
        ],
      },
      ...(usesGoogleFonts
        ? [{
            heading: 'Externe Schriftarten (Google Fonts)',
            paragraphs: [
              'Zur einheitlichen Darstellung von Schriften wird die Schriftart „Geist" beim Aufruf '
              + 'der Seite von einem Server von Google geladen (Google Ireland Limited, Gordon '
              + 'House, Barrow Street, Dublin 4, Irland). Dabei wird Ihre IP-Adresse an Google '
              + 'übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte '
              + 'Interesse liegt in der einheitlichen Darstellung des Schriftbilds.',
              'Weitere Informationen: https://policies.google.com/privacy',
            ],
          }]
        : []),
      {
        heading: 'Speicherung in Ihrem Browser (localStorage und Cookie)',
        paragraphs: [
          'Die Anwendung speichert zwei Dinge lokal in Ihrem Browser:',
        ],
        list: [
          'den zuletzt bearbeiteten Diagrammstand im localStorage, damit ein Neuladen der Seite '
          + 'Ihre Arbeit nicht verwirft,',
          'ein Cookie, das sich merkt, ob die Seitenleiste ein- oder ausgeklappt ist.',
        ],
      },
      {
        paragraphs: [
          'Beide Angaben verbleiben auf Ihrem Gerät und werden zu keinem Zeitpunkt an mich oder '
          + 'an Dritte übertragen. Sie sind unbedingt erforderlich, um den von Ihnen ausdrücklich '
          + 'gewünschten Dienst bereitzustellen; eine Einwilligung ist dafür nach § 25 Abs. 2 '
          + 'Nr. 2 TDDDG nicht erforderlich. Sie können diese Daten jederzeit löschen — über die '
          + 'Einstellungen Ihres Browsers oder, für den Diagrammstand, über die Schaltfläche '
          + '„Clear autosaved copy" in den Einstellungen der Anwendung.',
        ],
      },
      {
        heading: 'Kein Tracking, keine Weitergabe',
        paragraphs: [
          'Es werden keine Analyse- oder Reichweitenmessungs-Werkzeuge, keine Social-Media-Plugins '
          + 'und keine Werbenetzwerke eingesetzt. Es findet kein Profiling und keine automatisierte '
          + 'Entscheidungsfindung statt. Eine Weitergabe personenbezogener Daten an Dritte erfolgt '
          + 'nur, soweit dies gesetzlich vorgeschrieben ist.',
        ],
      },
      {
        heading: 'Verschlüsselung',
        paragraphs: [
          'Die Website wird ausschließlich über eine mit TLS verschlüsselte Verbindung (HTTPS) '
          + 'ausgeliefert.',
        ],
      },
      {
        heading: 'Ihre Rechte',
        paragraphs: ['Sie haben nach der DSGVO jederzeit das Recht auf:'],
        list: [
          'Auskunft über die zu Ihrer Person gespeicherten Daten (Art. 15 DSGVO),',
          'Berichtigung unrichtiger Daten (Art. 16 DSGVO),',
          'Löschung (Art. 17 DSGVO),',
          'Einschränkung der Verarbeitung (Art. 18 DSGVO),',
          'Datenübertragbarkeit (Art. 20 DSGVO),',
          'Widerspruch gegen die Verarbeitung, die auf Art. 6 Abs. 1 lit. f DSGVO beruht '
          + '(Art. 21 DSGVO).',
        ],
      },
      {
        paragraphs: [
          `Wenden Sie sich dafür an ${operator.email}. Unabhängig davon steht Ihnen nach Art. 77 `
          + 'DSGVO ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu, insbesondere in '
          + 'dem Mitgliedstaat Ihres Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des '
          + 'mutmaßlichen Verstoßes.'
          + (supervisoryAuthority.name
            ? ` Zuständige Aufsichtsbehörde: ${supervisoryAuthority.name}`
              + (supervisoryAuthority.url ? ` (${supervisoryAuthority.url})` : '') + '.'
            : ''),
        ],
      },
      {
        heading: 'Änderungen dieser Erklärung',
        paragraphs: [
          'Diese Datenschutzerklärung wird angepasst, sobald sich die Anwendung oder die '
          + `Rechtslage ändert. Stand: ${lastUpdated}.`,
        ],
      },
    ],
  },
  {
    id: 'disclaimer',
    label: 'Haftung & Urheberrecht',
    title: 'Haftungsausschluss und Urheberrecht',
    blocks: [
      {
        heading: 'Haftung für Inhalte',
        paragraphs: [
          'Als Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten '
          + 'nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG bin ich als '
          + 'Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde '
          + 'Informationen zu überwachen oder nach Umständen zu forschen, die auf eine '
          + 'rechtswidrige Tätigkeit hinweisen.',
          'Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den '
          + 'allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist '
          + 'jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. '
          + 'Bei Bekanntwerden entsprechender Rechtsverletzungen werden diese Inhalte umgehend '
          + 'entfernt.',
        ],
      },
      {
        heading: 'Haftung für Links',
        paragraphs: [
          'Dieses Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte ich '
          + 'keinen Einfluss habe. Für diese fremden Inhalte kann keine Gewähr übernommen werden. '
          + 'Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder '
          + 'Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der '
          + 'Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht '
          + 'erkennbar. Bei Bekanntwerden von Rechtsverletzungen werden derartige Links umgehend '
          + 'entfernt.',
        ],
      },
      {
        heading: 'Urheberrecht',
        paragraphs: [
          'Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten '
          + 'unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, '
          + 'Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts '
          + 'bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. '
          + 'Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen '
          + 'Gebrauch gestattet.',
          'Die Diagramme, die Sie mit der Anwendung erstellen, sind allein Ihre Inhalte. Es '
          + 'werden daran keinerlei Rechte beansprucht.',
        ],
      },
      {
        heading: 'Keine Gewähr für die Anwendung',
        paragraphs: [
          'Die Anwendung wird unentgeltlich und ohne Gewährleistung „wie besehen" bereitgestellt. '
          + 'Für die Verfügbarkeit, Fehlerfreiheit oder Eignung für einen bestimmten Zweck wird '
          + 'keine Haftung übernommen.',
          'Diagramme werden ausschließlich lokal in Ihrem Browser gespeichert. Es gibt keine '
          + 'serverseitige Sicherung. Löschen der Browserdaten, ein privates Fenster oder ein '
          + 'Wechsel des Geräts führen zum Verlust des gespeicherten Stands. Exportieren Sie '
          + 'wichtige Diagramme als Datei.',
          'Die Haftung für Schäden aus der Nutzung oder Nichtnutzung der Anwendung ist auf '
          + 'Vorsatz und grobe Fahrlässigkeit beschränkt. Unberührt bleibt die Haftung für '
          + 'Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach '
          + 'zwingenden gesetzlichen Vorschriften.',
        ],
      },
      {
        heading: 'Marken- und Produktnamen Dritter',
        paragraphs: [
          'Der Technologie-Katalog der Anwendung nennt Produkt-, Firmen- und Markennamen Dritter. '
          + 'Diese sind Eigentum der jeweiligen Rechteinhaber und werden ausschließlich zu '
          + 'Beschreibungs- und Identifikationszwecken verwendet. Ihre Nennung begründet weder '
          + 'eine Verbindung zu den Rechteinhabern noch deren Zustimmung oder Unterstützung.',
        ],
      },
      {
        heading: 'Verwendete Open-Source-Komponenten',
        paragraphs: [
          'Die Anwendung nutzt freie Software Dritter, darunter Vue, Vue Flow, Tailwind CSS, '
          + 'Reka UI und die Lucide-Icons. Diese Komponenten stehen unter ihren jeweiligen '
          + 'Lizenzen (überwiegend MIT bzw. ISC); die Urheberrechtsvermerke der jeweiligen '
          + 'Projekte gelten fort.',
        ],
      },
    ],
  },
]

const en: LegalDocument[] = [
  {
    id: 'privacy',
    label: 'Privacy',
    title: 'Privacy Policy',
    blocks: [
      {
        heading: 'In short',
        paragraphs: [
          `${site.name} runs entirely in your browser. Diagrams you create are never sent to a `
          + 'server; they are stored locally in your browser only. There are no user accounts, no '
          + 'contact forms, no analytics or tracking tools and no advertising.',
        ],
      },
      {
        heading: 'Controller under the GDPR',
        lines: [...address, ...contactEn],
      },
      {
        heading: 'Hosting and server log files',
        paragraphs: [
          `This site is hosted on ${hosting.provider}, operated by ${hosting.company}.`,
          'When you open the site, the host automatically processes data transmitted by your '
          + 'browser in server log files: IP address, date and time of access, the file '
          + 'requested, volume of data transferred, referrer URL, and browser and operating '
          + 'system identifiers. This processing is technically necessary to deliver the site and '
          + 'keep it secure.',
          'The legal basis is Art. 6(1)(f) GDPR; the legitimate interest is the technically '
          + 'reliable and secure provision of the site. This data is not combined with other '
          + 'sources, and I have no access to the log files myself.',
          'Processing also takes place on servers in the United States. For details of the '
          + 'processing and the basis for third-country transfers (the EU-U.S. Data Privacy '
          + 'Framework adequacy decision and/or standard contractual clauses), see the host’s '
          + `privacy statement: ${hosting.privacyUrl}`,
        ],
      },
      ...(usesGoogleFonts
        ? [{
            heading: 'External fonts (Google Fonts)',
            paragraphs: [
              'To present type consistently, the "Geist" typeface is loaded from a Google server '
              + 'when the page opens (Google Ireland Limited, Gordon House, Barrow Street, '
              + 'Dublin 4, Ireland). Your IP address is transmitted to Google in the process. The '
              + 'legal basis is Art. 6(1)(f) GDPR; the legitimate interest is a consistent '
              + 'presentation of the site.',
              'Further information: https://policies.google.com/privacy',
            ],
          }]
        : []),
      {
        heading: 'Storage in your browser (localStorage and cookie)',
        paragraphs: ['The application stores two things locally in your browser:'],
        list: [
          'the most recent state of your diagram in localStorage, so that reloading the page does '
          + 'not discard your work,',
          'a cookie remembering whether the sidebar is expanded or collapsed.',
        ],
      },
      {
        paragraphs: [
          'Both stay on your device and are never transmitted to me or to any third party. They '
          + 'are strictly necessary to provide the service you explicitly requested, so no '
          + 'consent is required under § 25 (2) no. 2 TDDDG. You can delete them at any time via '
          + 'your browser settings or, for the saved diagram, via the "Clear autosaved copy" '
          + 'button in the application settings.',
        ],
      },
      {
        heading: 'No tracking, no disclosure',
        paragraphs: [
          'No analytics or audience-measurement tools, social media plugins or advertising '
          + 'networks are used. There is no profiling and no automated decision-making. Personal '
          + 'data is disclosed to third parties only where required by law.',
        ],
      },
      {
        heading: 'Encryption',
        paragraphs: ['The site is served exclusively over a TLS-encrypted connection (HTTPS).'],
      },
      {
        heading: 'Your rights',
        paragraphs: ['Under the GDPR you have the right at any time to:'],
        list: [
          'access the data held about you (Art. 15 GDPR),',
          'rectification of inaccurate data (Art. 16 GDPR),',
          'erasure (Art. 17 GDPR),',
          'restriction of processing (Art. 18 GDPR),',
          'data portability (Art. 20 GDPR),',
          'object to processing based on Art. 6(1)(f) GDPR (Art. 21 GDPR).',
        ],
      },
      {
        paragraphs: [
          `To exercise these rights, contact ${operator.email}. You also have the right under `
          + 'Art. 77 GDPR to lodge a complaint with a supervisory authority, in particular in the '
          + 'member state of your residence, place of work or the place of the alleged '
          + 'infringement.'
          + (supervisoryAuthority.name
            ? ` Competent authority: ${supervisoryAuthority.name}`
              + (supervisoryAuthority.url ? ` (${supervisoryAuthority.url})` : '') + '.'
            : ''),
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'This policy is updated whenever the application or the legal situation changes. '
          + `Last updated: ${lastUpdated}.`,
        ],
      },
    ],
  },
  {
    id: 'disclaimer',
    label: 'Liability & Copyright',
    title: 'Disclaimer and Copyright',
    blocks: [
      {
        heading: 'Liability for content',
        paragraphs: [
          'As a service provider I am responsible for my own content on these pages under general '
          + 'law, pursuant to § 7 (1) DDG. Under §§ 8 to 10 DDG, however, I am not obliged to '
          + 'monitor transmitted or stored third-party information or to investigate '
          + 'circumstances indicating unlawful activity.',
          'Obligations to remove or block the use of information under general law remain '
          + 'unaffected. Liability in this respect is only possible from the point in time at '
          + 'which a concrete infringement becomes known. Upon notification of such '
          + 'infringements, the content concerned will be removed immediately.',
        ],
      },
      {
        heading: 'Liability for links',
        paragraphs: [
          'This service contains links to external third-party websites over whose content I have '
          + 'no influence. No warranty can therefore be given for that third-party content. The '
          + 'respective provider or operator of the linked pages is always responsible for their '
          + 'content. Linked pages were checked for possible legal violations at the time of '
          + 'linking; no unlawful content was apparent. Upon notification of violations, such '
          + 'links will be removed immediately.',
        ],
      },
      {
        heading: 'Copyright',
        paragraphs: [
          'Content and works created by the site operator on these pages are subject to German '
          + 'copyright law. Reproduction, adaptation, distribution and any kind of exploitation '
          + 'beyond the limits of copyright require the written consent of the respective author '
          + 'or creator. Downloads and copies of this site are permitted for private, '
          + 'non-commercial use only.',
          'The diagrams you create with the application are entirely your own content. No rights '
          + 'to them are claimed.',
        ],
      },
      {
        heading: 'No warranty for the application',
        paragraphs: [
          'The application is provided free of charge and "as is", without warranty. No liability '
          + 'is accepted for its availability, freedom from errors or fitness for a particular '
          + 'purpose.',
          'Diagrams are stored locally in your browser only. There is no server-side backup. '
          + 'Clearing browser data, using a private window or switching devices will lose the '
          + 'saved state. Export important diagrams to a file.',
          'Liability for damages arising from the use or non-use of the application is limited to '
          + 'intent and gross negligence. Liability for injury to life, body or health and under '
          + 'mandatory statutory provisions remains unaffected.',
        ],
      },
      {
        heading: 'Third-party trademarks and product names',
        paragraphs: [
          'The application’s technology catalogue names third-party products, companies and '
          + 'trademarks. These are the property of their respective owners and are used purely '
          + 'for descriptive and identification purposes. Naming them implies no affiliation with, '
          + 'or endorsement by, the rights holders.',
        ],
      },
      {
        heading: 'Open source components',
        paragraphs: [
          'The application uses third-party free software, including Vue, Vue Flow, Tailwind CSS, '
          + 'Reka UI and the Lucide icons. These components are provided under their respective '
          + 'licences (mostly MIT or ISC); the copyright notices of the respective projects '
          + 'continue to apply.',
        ],
      },
    ],
  },
]

export const legalDocuments: Record<LegalLocale, LegalDocument[]> = { de, en }

/**
 * Shown on the Legal page, next to the link to the hosted Impressum. The
 * hosted page covers § 5 DDG and consumer dispute resolution; this only adds
 * what it cannot know — that the service is private and non-commercial.
 */
export const imprintNotice: Record<LegalLocale, string> = {
  de: `${site.name} ist ein privates, nicht-kommerzielles Projekt. Die Anwendung wird `
    + 'unentgeltlich bereitgestellt, es werden keine Verträge geschlossen, keine Zahlungen '
    + 'entgegengenommen und keine Benutzerkonten geführt.',
  en: `${site.name} is a private, non-commercial project. It is provided free of charge; no `
    + 'contracts are concluded, no payments are accepted and no user accounts exist.',
}

/** German is the binding version; the English texts are a convenience translation. */
export const bindingLocaleNotice: Record<LegalLocale, string> = {
  de: 'Maßgeblich ist die deutsche Fassung dieser Texte.',
  en: 'The German version of these texts is the legally binding one.',
}
