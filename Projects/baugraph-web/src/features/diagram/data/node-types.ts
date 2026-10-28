import type { ColorKey, ShapeKey } from '@/model'
import { DEFAULT_NODE_SIZE, DEFAULT_ZONE_SIZE } from '@/model'
import { humanise } from '@/features/diagram/data/tech'

/**
 * The node-type catalogue — what a node *is*, independent of what it is called.
 *
 * A node stores the id (`api_gateway`), every surface shows the label
 * (`API Gateway`). The type is drawn on the node itself and never changes when
 * the node is renamed: a cylinder called "Orders" still says it is a database,
 * so no one has to remember what an icon meant.
 *
 * A type also carries the styling a new node starts from (icon, colour, shape,
 * size) and the technology category the inspector offers first — a database
 * node suggests PostgreSQL and IBM DB2 rather than the whole catalogue.
 */

export interface NodeType {
  /** Stable snake_case id, written to the diagram file as `type`. */
  id: string
  /** How it is spelled on screen, and the label a new node starts with. */
  label: string
  /** Icon drawn inside the node. */
  icon?: string
  /**
   * Icon shown next to the palette entry only, for types whose node carries no
   * icon of its own — a zone has no icon slot, and a note drawing a note icon
   * inside itself is just noise. Falls back to `icon`.
   */
  listIcon?: string
  color: ColorKey
  shape?: ShapeKey
  kind?: 'shape' | 'zone' | 'annotation'
  width?: number
  height?: number
  /** Id of the technology category offered first for this type. */
  tech?: string
  /** Extra search terms for the palette's search box. */
  aliases?: string[]
}

export interface NodeTypeGroup {
  id: string
  label: string
  /**
   * The building blocks of one industry — a bank's ledger, a telco's charging
   * system — rather than a technical role every architecture shares. The
   * palette lists these in a section of their own, folded away until wanted,
   * and each can be hidden in Settings.
   */
  industry?: boolean
  types: NodeType[]
}

export const NODE_TYPE_GROUPS: NodeTypeGroup[] = [
  {
    id: 'flow',
    label: 'Flow',
    types: [
      { id: 'start', label: 'Start', icon: 'play', color: 'slate', shape: 'pill', width: 130, height: 56 },
      { id: 'end', label: 'End', icon: 'flag', color: 'slate', shape: 'pill', width: 130, height: 56 },
      { id: 'step', label: 'Step', listIcon: 'square', color: 'slate', shape: 'rect', width: 150, height: 62 },
      {
        id: 'decision',
        label: 'Decision',
        icon: 'split',
        color: 'amber',
        shape: 'diamond',
        width: 160,
        height: 110,
      },
      {
        id: 'note',
        label: 'Note',
        listIcon: 'sticky-note',
        color: 'amber',
        shape: 'note',
        width: 180,
        height: 84,
      },
    ],
  },
  {
    id: 'annotations',
    label: 'Annotations',
    types: [
      {
        id: 'text',
        label: 'Text',
        listIcon: 'type',
        color: 'slate',
        shape: 'text',
        kind: 'annotation',
        width: 120,
        height: 36,
        aliases: ['label', 'caption'],
      },
    ],
  },
  {
    id: 'zones',
    label: 'Zones',
    types: [
      { id: 'zone', label: 'Zone', listIcon: 'frame', color: 'slate', kind: 'zone' },
      { id: 'vpc', label: 'VPC', listIcon: 'network', color: 'blue', kind: 'zone', tech: 'cloud', aliases: ['subnet'] },
      { id: 'cluster', label: 'Cluster', listIcon: 'boxes', color: 'blue', kind: 'zone', tech: 'container' },
      { id: 'namespace', label: 'Namespace', listIcon: 'group', color: 'teal', kind: 'zone', tech: 'container' },
      { id: 'environment', label: 'Environment', listIcon: 'layers', color: 'slate', kind: 'zone', aliases: ['stage', 'prod'] },
      { id: 'region', label: 'Region', listIcon: 'globe', color: 'slate', kind: 'zone', tech: 'cloud' },
      { id: 'account', label: 'Account', listIcon: 'landmark', color: 'purple', kind: 'zone', tech: 'cloud', aliases: ['subscription', 'tenant'] },
      { id: 'data_centre', label: 'Data centre', listIcon: 'building-2', color: 'slate', kind: 'zone', aliases: ['data center', 'site'] },
      { id: 'bounded_context', label: 'Bounded context', listIcon: 'library', color: 'purple', kind: 'zone', aliases: ['domain'] },
    ],
  },
  {
    id: 'compute',
    label: 'Services & compute',
    types: [
      { id: 'application', label: 'Application', icon: 'grid-2x-2', color: 'blue', tech: 'runtime', aliases: ['app'] },
      { id: 'service', label: 'Service', icon: 'package', color: 'blue', tech: 'runtime' },
      { id: 'microservice', label: 'Microservice', icon: 'boxes', color: 'blue', tech: 'runtime' },
      { id: 'api', label: 'API', icon: 'code', color: 'blue', shape: 'round', tech: 'runtime', aliases: ['rest', 'graphql'] },
      { id: 'api_gateway', label: 'API Gateway', icon: 'door-open', color: 'blue', tech: 'api_gateway' },
      { id: 'function', label: 'Function', icon: 'zap', color: 'blue', tech: 'runtime', aliases: ['lambda', 'serverless'] },
      {
        id: 'serverless_function',
        label: 'Serverless Function',
        icon: 'bolt',
        color: 'blue',
        tech: 'cloud_compute',
        aliases: ['faas', 'cloud function', 'lambda'],
      },
      { id: 'container', label: 'Container', icon: 'container', color: 'slate', tech: 'container' },
      {
        id: 'container_registry',
        label: 'Container Registry',
        icon: 'archive-restore',
        color: 'slate',
        tech: 'container',
        aliases: ['image registry', 'docker registry'],
      },
      { id: 'server', label: 'Server', icon: 'server', color: 'slate', tech: 'web_server' },
      { id: 'worker', label: 'Worker', icon: 'cog', color: 'slate', tech: 'runtime', aliases: ['consumer'] },
      { id: 'batch_job', label: 'Batch Job', icon: 'hourglass', color: 'slate', tech: 'runtime' },
      { id: 'web_app', label: 'Web App', icon: 'app-window', color: 'blue', tech: 'frontend' },
      { id: 'static_site', label: 'Static Site', icon: 'file-text', color: 'blue', tech: 'frontend', aliases: ['jamstack', 'static website'] },
      { id: 'mobile_app', label: 'Mobile App', icon: 'smartphone', color: 'blue', tech: 'frontend' },
      { id: 'desktop_app', label: 'Desktop App', icon: 'monitor', color: 'blue', tech: 'frontend' },
    ],
  },
  {
    id: 'data',
    label: 'Data & storage',
    types: [
      { id: 'database', label: 'Database', icon: 'database', color: 'green', shape: 'cylinder', tech: 'database', aliases: ['sql', 'rdbms'] },
      { id: 'nosql_store', label: 'NoSQL Store', icon: 'hard-drive', color: 'green', shape: 'cylinder', tech: 'database' },
      { id: 'cache', label: 'Cache', icon: 'zap', color: 'green', shape: 'cylinder', tech: 'cache' },
      { id: 'data_warehouse', label: 'Data Warehouse', icon: 'warehouse', color: 'green', shape: 'cylinder', tech: 'data_platform', aliases: ['lakehouse'] },
      { id: 'data_lake', label: 'Data Lake', icon: 'hard-drive-download', color: 'green', shape: 'cylinder', tech: 'data_platform', aliases: ['lake'] },
      { id: 'data_mart', label: 'Data Mart', icon: 'table-2', color: 'green', shape: 'cylinder', tech: 'data_platform' },
      { id: 'search_index', label: 'Search Index', icon: 'search', color: 'green', shape: 'cylinder', tech: 'search' },
      { id: 'object_storage', label: 'Object Storage', icon: 'archive', color: 'green', tech: 'storage', aliases: ['bucket', 's3'] },
      { id: 'file_share', label: 'File Share', icon: 'folder', color: 'green', tech: 'storage' },
      { id: 'file_write', label: 'File Write', icon: 'file-up', color: 'green', tech: 'storage' },
      { id: 'backup', label: 'Backup', icon: 'save', color: 'green', tech: 'storage', aliases: ['snapshot'] },
      { id: 'csv_export', label: 'CSV Export', icon: 'sheet', color: 'green' },
      { id: 'json_payload', label: 'JSON Payload', icon: 'braces', color: 'green' },
      { id: 'xml_payload', label: 'XML Payload', icon: 'file-code', color: 'green' },
      { id: 'table', label: 'Table', icon: 'table', color: 'green' },
      { id: 'dashboard', label: 'Dashboard', icon: 'chart-pie', color: 'green', tech: 'data_platform', aliases: ['bi dashboard'] },
      { id: 'report', label: 'Report', icon: 'chart-bar', color: 'green', tech: 'data_platform', aliases: ['bi report'] },
      { id: 'disk', label: 'Disk', icon: 'hard-drive', color: 'slate' },
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging & events',
    types: [
      { id: 'queue', label: 'Queue', icon: 'layers-2', color: 'amber', shape: 'queue', tech: 'message_broker' },
      { id: 'topic', label: 'Topic', icon: 'radio-tower', color: 'amber', shape: 'queue', tech: 'message_broker' },
      { id: 'event_bus', label: 'Event Bus', icon: 'radio', color: 'amber', tech: 'message_broker' },
      { id: 'stream', label: 'Stream', icon: 'activity', color: 'amber', shape: 'queue', tech: 'message_broker' },
      { id: 'message_broker', label: 'Message Broker', icon: 'shuffle', color: 'amber', tech: 'message_broker', aliases: ['mom'] },
      {
        id: 'dead_letter_queue',
        label: 'Dead Letter Queue',
        icon: 'triangle-alert',
        color: 'red',
        shape: 'queue',
        tech: 'message_broker',
        aliases: ['dlq'],
      },
      { id: 'webhook', label: 'Webhook', icon: 'webhook', color: 'amber' },
      { id: 'notification', label: 'Notification', icon: 'bell', color: 'amber' },
      { id: 'email', label: 'Email', icon: 'mail', color: 'amber', aliases: ['smtp'] },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', color: 'amber' },
      { id: 'publisher', label: 'Publisher', icon: 'megaphone', color: 'amber' },
      { id: 'feed', label: 'Feed', icon: 'rss', color: 'amber' },
    ],
  },
  {
    id: 'integration',
    label: 'Integration & routing',
    types: [
      { id: 'middleware', label: 'Middleware', icon: 'settings', color: 'purple', tech: 'integration' },
      { id: 'esb', label: 'ESB', icon: 'network', color: 'purple', tech: 'integration', aliases: ['bus'] },
      { id: 'adapter', label: 'Adapter', icon: 'plug', color: 'purple', tech: 'integration' },
      { id: 'transformer', label: 'Transformer', icon: 'arrow-left-right', color: 'purple', tech: 'integration', aliases: ['mapping'] },
      { id: 'router', label: 'Router', icon: 'split', color: 'purple', tech: 'integration' },
      { id: 'load_balancer', label: 'Load Balancer', icon: 'scale', color: 'purple', tech: 'web_server' },
      { id: 'proxy', label: 'Proxy', icon: 'router', color: 'purple', tech: 'web_server' },
      { id: 'filter', label: 'Filter', icon: 'funnel', color: 'purple', tech: 'integration' },
      { id: 'etl_pipeline', label: 'ETL Pipeline', icon: 'spline', color: 'purple', tech: 'data_platform' },
      { id: 'sync', label: 'Sync', icon: 'refresh-cw', color: 'purple', tech: 'integration' },
      { id: 'ingress', label: 'Ingress', icon: 'log-in', color: 'purple', tech: 'container' },
      { id: 'egress', label: 'Egress', icon: 'log-out', color: 'purple', tech: 'container' },
      { id: 'cdn', label: 'CDN', icon: 'satellite-dish', color: 'purple', tech: 'cloud', aliases: ['content delivery network', 'edge cache'] },
      { id: 'dns', label: 'DNS', icon: 'signpost', color: 'purple', tech: 'cloud', aliases: ['domain name system', 'name server'] },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    types: [
      { id: 'cron_job', label: 'Cron Job', icon: 'rotate-ccw-clock', color: 'teal', tech: 'ci_cd' },
      { id: 'scheduler', label: 'Scheduler', icon: 'calendar-check', color: 'teal', tech: 'ci_cd' },
      { id: 'timer', label: 'Timer', icon: 'alarm-clock', color: 'teal' },
      { id: 'retry', label: 'Retry', icon: 'rotate-cw', color: 'teal' },
      { id: 'backlog', label: 'Backlog', icon: 'kanban', color: 'teal' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    types: [
      { id: 'auth_service', label: 'Auth Service', icon: 'shield-check', color: 'red', tech: 'identity' },
      { id: 'identity_provider', label: 'Identity Provider', icon: 'fingerprint-pattern', color: 'red', tech: 'identity', aliases: ['idp', 'sso'] },
      { id: 'firewall', label: 'Firewall', icon: 'shield', color: 'red', aliases: ['waf'] },
      { id: 'secret_vault', label: 'Secret Vault', icon: 'vault', color: 'red', tech: 'identity' },
      { id: 'certificate', label: 'Certificate', icon: 'key-round', color: 'red', aliases: ['tls', 'pki'] },
      { id: 'access_control', label: 'Access Control', icon: 'lock', color: 'red', tech: 'identity', aliases: ['rbac'] },
      { id: 'vpn', label: 'VPN', icon: 'lock-keyhole', color: 'red', tech: 'identity', aliases: ['virtual private network', 'tunnel'] },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    types: [
      { id: 'monitoring', label: 'Monitoring', icon: 'gauge', color: 'slate', tech: 'observability' },
      { id: 'metrics', label: 'Metrics', icon: 'trending-up', color: 'slate', tech: 'observability' },
      { id: 'logging', label: 'Logging', icon: 'scroll-text', color: 'slate', tech: 'observability' },
      { id: 'alerting', label: 'Alerting', icon: 'bell-ring', color: 'red', tech: 'observability' },
      { id: 'ci_cd', label: 'CI/CD', icon: 'git-branch', color: 'slate', tech: 'ci_cd', aliases: ['pipeline', 'build'] },
      { id: 'config', label: 'Config', icon: 'sliders-horizontal', color: 'slate' },
      { id: 'health_check', label: 'Health Check', icon: 'circle-check', color: 'green' },
      { id: 'incident', label: 'Incident', icon: 'bug', color: 'red' },
      { id: 'terminal', label: 'Terminal', icon: 'terminal', color: 'slate' },
    ],
  },
  {
    id: 'ai_ml',
    label: 'AI & ML',
    types: [
      { id: 'ai_agent', label: 'AI Agent', icon: 'bot', color: 'purple', tech: 'ai_ml', aliases: ['agent'] },
      {
        id: 'llm',
        label: 'LLM',
        icon: 'sparkles',
        color: 'purple',
        tech: 'ai_ml',
        aliases: ['large language model', 'chat model', 'genai'],
      },
      { id: 'ml_model', label: 'ML Model', icon: 'brain', color: 'purple', tech: 'ai_ml', aliases: ['model', 'inference endpoint'] },
      {
        id: 'ml_pipeline',
        label: 'ML Pipeline',
        icon: 'workflow',
        color: 'purple',
        tech: 'ai_ml',
        aliases: ['training pipeline', 'mlops'],
      },
      { id: 'feature_store', label: 'Feature Store', icon: 'library', color: 'green', tech: 'ai_ml' },
      {
        id: 'vector_store',
        label: 'Vector Store',
        icon: 'target',
        color: 'green',
        shape: 'cylinder',
        tech: 'database',
        aliases: ['embeddings', 'vector db'],
      },
    ],
  },
  {
    id: 'actors',
    label: 'Actors & context',
    types: [
      { id: 'user', label: 'User', icon: 'user', color: 'slate', shape: 'circle', width: 110, height: 110, aliases: ['customer', 'actor'] },
      { id: 'team', label: 'Team', icon: 'users', color: 'slate' },
      { id: 'external_system', label: 'External System', icon: 'building-2', color: 'slate' },
      { id: 'third_party', label: 'Third Party', icon: 'briefcase', color: 'slate', aliases: ['vendor', 'saas'] },
      { id: 'internet', label: 'Internet', icon: 'globe', color: 'slate' },
      { id: 'cloud', label: 'Cloud', icon: 'cloud', color: 'slate', tech: 'cloud' },
      { id: 'network', label: 'Network', icon: 'network', color: 'slate' },
      { id: 'device', label: 'Device', icon: 'cpu', color: 'slate', aliases: ['iot'] },
      { id: 'printer', label: 'Printer', icon: 'printer', color: 'slate' },
      { id: 'payment', label: 'Payment', icon: 'credit-card', color: 'pink' },
      { id: 'location', label: 'Location', icon: 'map-pin', color: 'pink' },
    ],
  },

  /* ------------------------------------------------------------ industries */

  {
    id: 'banking',
    label: 'Banking & payments',
    industry: true,
    types: [
      { id: 'core_banking', label: 'Core Banking', icon: 'landmark', color: 'blue', tech: 'core_banking', aliases: ['cbs', 'account system'] },
      { id: 'ledger', label: 'Ledger', icon: 'book-open-check', color: 'green', shape: 'cylinder', tech: 'core_banking', aliases: ['general ledger', 'gl', 'accounting'] },
      { id: 'payment_hub', label: 'Payment Hub', icon: 'arrow-right-left', color: 'pink', tech: 'payment_networks', aliases: ['payment engine', 'payments', 'ach', 'rtp', 'instant payments'] },
      { id: 'card_processor', label: 'Card Processor', icon: 'credit-card', color: 'pink', tech: 'payment_providers', aliases: ['card issuing', 'acquirer', 'issuer', 'authorisation'] },
      { id: 'clearing_settlement', label: 'Clearing & Settlement', icon: 'scale', color: 'purple', tech: 'payment_networks', aliases: ['clearing house', 'settlement', 'csm'] },
      { id: 'kyc_aml', label: 'KYC / AML', icon: 'id-card', color: 'amber', aliases: ['know your customer', 'anti money laundering', 'compliance', 'onboarding'] },
      { id: 'fraud_detection', label: 'Fraud Detection', icon: 'shield-alert', color: 'red', aliases: ['fraud', 'transaction monitoring'] },
      { id: 'risk_engine', label: 'Risk Engine', icon: 'gauge', color: 'amber', aliases: ['risk', 'credit scoring', 'scoring'] },
      { id: 'open_banking_api', label: 'Open Banking API', icon: 'plug-zap', color: 'teal', aliases: ['psd2', 'open finance', 'xs2a'] },
      { id: 'atm', label: 'ATM', icon: 'banknote', color: 'slate', aliases: ['cash machine', 'cash point'] },
      { id: 'branch', label: 'Branch / Teller', icon: 'building', color: 'slate', aliases: ['teller', 'counter', 'bank branch'] },
    ],
  },
  {
    id: 'telco',
    label: 'Telco',
    industry: true,
    types: [
      { id: 'ran', label: 'RAN / Base Station', icon: 'radio-tower', color: 'blue', tech: 'telco_network', aliases: ['radio access network', 'gnodeb', 'enodeb', 'cell site', '5g nr'] },
      { id: 'core_network', label: 'Core Network', icon: 'waypoints', color: 'blue', tech: 'telco_network', aliases: ['5gc', 'epc', 'packet core', 'amf', 'smf', 'upf', 'mobile core'] },
      { id: 'subscriber_db', label: 'Subscriber DB', icon: 'database', color: 'green', shape: 'cylinder', tech: 'telco_network', aliases: ['hss', 'hlr', 'udm', 'udr', 'subscriber data'] },
      { id: 'ims', label: 'IMS', icon: 'phone', color: 'purple', tech: 'telco_network', aliases: ['ip multimedia subsystem', 'volte', 'vonr', 'voip'] },
      { id: 'smsc', label: 'SMSC', icon: 'message-square', color: 'amber', tech: 'telco_network', aliases: ['sms', 'sms centre', 'sms center'] },
      { id: 'charging', label: 'Charging (OCS)', icon: 'coins', color: 'pink', tech: 'telco_bss', aliases: ['ocs', 'chf', 'online charging', 'rating', 'convergent charging'] },
      { id: 'oss', label: 'OSS', icon: 'monitor-cog', color: 'teal', tech: 'telco_bss', aliases: ['operations support system', 'network management', 'service assurance', 'inventory'] },
      { id: 'bss', label: 'BSS', icon: 'briefcase-business', color: 'purple', tech: 'telco_bss', aliases: ['business support system', 'billing', 'crm', 'product catalogue'] },
      { id: 'provisioning', label: 'Provisioning', icon: 'list-checks', color: 'teal', tech: 'telco_bss', aliases: ['activation', 'service activation', 'order fulfilment'] },
      { id: 'esim', label: 'eSIM', icon: 'card-sim', color: 'slate', aliases: ['sim', 'euicc', 'rsp', 'sm-dp+'] },
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    industry: true,
    types: [
      { id: 'policy_admin', label: 'Policy Administration', icon: 'file-text', color: 'blue', tech: 'insurance', aliases: ['pas', 'policy system', 'policy admin'] },
      { id: 'claims', label: 'Claims', icon: 'clipboard-list', color: 'amber', tech: 'insurance', aliases: ['claims management', 'fnol', 'loss'] },
      { id: 'underwriting', label: 'Underwriting', icon: 'signature', color: 'purple', tech: 'insurance', aliases: ['risk selection', 'underwriter'] },
      { id: 'rating_engine', label: 'Rating Engine', icon: 'calculator', color: 'teal', tech: 'insurance', aliases: ['rating', 'pricing', 'quote', 'premium'] },
      { id: 'broker_portal', label: 'Broker Portal', icon: 'handshake', color: 'slate', aliases: ['agent portal', 'intermediary', 'distribution'] },
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    industry: true,
    types: [
      { id: 'ehr', label: 'EHR', icon: 'clipboard-plus', color: 'red', tech: 'healthcare', aliases: ['emr', 'electronic health record', 'electronic medical record', 'clinical system'] },
      { id: 'pacs', label: 'PACS', icon: 'scan', color: 'blue', aliases: ['imaging', 'dicom', 'radiology', 'vna'] },
      { id: 'lab_system', label: 'Lab System', icon: 'test-tube', color: 'teal', aliases: ['lis', 'lims', 'laboratory'] },
      { id: 'interface_engine', label: 'Interface Engine', icon: 'arrow-left-right', color: 'amber', tech: 'healthcare_integration', aliases: ['hl7', 'fhir', 'integration engine', 'hie'] },
      { id: 'patient_portal', label: 'Patient Portal', icon: 'heart-pulse', color: 'pink', tech: 'healthcare', aliases: ['patient app', 'mychart', 'telehealth'] },
    ],
  },
  {
    id: 'retail',
    label: 'Retail & e-commerce',
    industry: true,
    types: [
      { id: 'pos', label: 'POS', icon: 'scan-barcode', color: 'amber', aliases: ['point of sale', 'till', 'cash register', 'checkout terminal'] },
      { id: 'order_management', label: 'Order Management', icon: 'package-check', color: 'blue', tech: 'commerce', aliases: ['oms', 'order management system', 'fulfilment'] },
      { id: 'inventory', label: 'Inventory / WMS', icon: 'warehouse', color: 'green', aliases: ['wms', 'warehouse management', 'stock'] },
      { id: 'pim', label: 'PIM', icon: 'tags', color: 'purple', tech: 'commerce', aliases: ['product information management', 'product catalogue', 'catalog'] },
      { id: 'checkout', label: 'Checkout', icon: 'shopping-cart', color: 'pink', tech: 'commerce', aliases: ['cart', 'basket', 'storefront'] },
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & IoT',
    industry: true,
    types: [
      { id: 'plc', label: 'PLC', icon: 'circuit-board', color: 'slate', tech: 'industrial_automation', aliases: ['programmable logic controller', 'controller'] },
      { id: 'scada', label: 'SCADA', icon: 'monitor-cog', color: 'teal', tech: 'industrial_automation', aliases: ['hmi', 'control system', 'ics', 'dcs'] },
      { id: 'mes', label: 'MES', icon: 'factory', color: 'amber', aliases: ['manufacturing execution system', 'shop floor'] },
      { id: 'historian', label: 'Historian', icon: 'chart-line', color: 'green', shape: 'cylinder', tech: 'industrial_data', aliases: ['process historian', 'time series', 'plant data'] },
      { id: 'edge_gateway', label: 'Edge Gateway', icon: 'router', color: 'teal', tech: 'industrial_automation', aliases: ['iot gateway', 'edge', 'field gateway'] },
      { id: 'digital_twin', label: 'Digital Twin', icon: 'rotate-3d', color: 'purple', aliases: ['twin', 'simulation', '3d model'] },
    ],
  },
]

/** The industry packs, in the order the palette and Settings list them. */
export const INDUSTRY_GROUPS: NodeTypeGroup[] = NODE_TYPE_GROUPS.filter((group) => group.industry)

export const NODE_TYPES: NodeType[] = NODE_TYPE_GROUPS.flatMap((group) => group.types)

const byId = new Map(NODE_TYPES.map((type) => [type.id, type]))

export function nodeType(id?: string | null): NodeType | undefined {
  return id ? byId.get(id) : undefined
}

/** Display name for a type id. Unknown ids are humanised, never dropped. */
export function nodeTypeLabel(id?: string | null): string {
  if (!id) return ''
  return byId.get(id)?.label ?? humanise(id)
}

/** Default box size for a type, falling back to the format's own defaults. */
export function nodeTypeSize(type: Pick<NodeType, 'kind' | 'width' | 'height'>) {
  const fallback = type.kind === 'zone' ? DEFAULT_ZONE_SIZE : DEFAULT_NODE_SIZE
  return { width: type.width ?? fallback.width, height: type.height ?? fallback.height }
}

export function matchesNodeType(type: NodeType, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [type.id, type.label, ...(type.aliases ?? [])].some((term) =>
    term.toLowerCase().includes(q),
  )
}
