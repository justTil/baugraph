/**
 * The technology catalogue — what a node actually runs on.
 *
 * A node stores the id (`postgresql`, `apache_kafka`), the UI and the canvas
 * show the label (`PostgreSQL`, `Apache Kafka`). Ids are snake_case, stable and
 * written to the file: renaming an entry here changes what is displayed, never
 * what a diagram refers to.
 *
 * Unknown ids are tolerated everywhere — a hand-written file may name a
 * technology this list has never heard of, and it is shown verbatim rather than
 * dropped. See `techLabel`.
 */

import { computed, reactive } from 'vue'
import { slugify, uniqueId } from '@/model'

export interface TechItem {
  /** Stable snake_case id, written to the diagram file as `tech`. */
  id: string
  /** How it is spelled on screen. */
  label: string
  /** Extra search terms — abbreviations, former names, common misspellings. */
  aliases?: string[]
}

export interface TechCategory {
  id: string
  label: string
  /**
   * Node type a node adopts when a technology from this category is picked and
   * the node has no type yet — choosing "PostgreSQL" makes it a database.
   * Ids come from `node-types.ts`.
   */
  nodeType: string
  items: TechItem[]
}

export const TECH_CATEGORIES: TechCategory[] = [
  {
    id: 'database',
    label: 'Databases',
    nodeType: 'database',
    items: [
      { id: 'postgresql', label: 'PostgreSQL', aliases: ['postgres', 'pg'] },
      { id: 'mysql', label: 'MySQL' },
      { id: 'mariadb', label: 'MariaDB' },
      { id: 'oracle_database', label: 'Oracle Database', aliases: ['oracle'] },
      { id: 'oracle_database_11g', label: 'Oracle Database 11g', aliases: ['oracle 11g'] },
      { id: 'oracle_database_12c', label: 'Oracle Database 12c', aliases: ['oracle 12c'] },
      { id: 'oracle_database_19c', label: 'Oracle Database 19c', aliases: ['oracle 19c'] },
      { id: 'ibm_db2', label: 'IBM DB2', aliases: ['db2'] },
      { id: 'microsoft_sql_server', label: 'Microsoft SQL Server', aliases: ['mssql', 't-sql'] },
      { id: 'sqlite', label: 'SQLite' },
      { id: 'h2', label: 'H2' },
      { id: 'apache_derby', label: 'Apache Derby' },
      { id: 'firebird', label: 'Firebird' },
      { id: 'sap_hana', label: 'SAP HANA', aliases: ['hana'] },
      { id: 'sap_ase', label: 'SAP ASE', aliases: ['sybase'] },
      { id: 'ibm_informix', label: 'IBM Informix' },
      { id: 'teradata', label: 'Teradata' },
      { id: 'cockroachdb', label: 'CockroachDB' },
      { id: 'amazon_aurora', label: 'Amazon Aurora' },
      { id: 'amazon_rds', label: 'Amazon RDS' },
      { id: 'google_cloud_sql', label: 'Google Cloud SQL' },
      { id: 'google_spanner', label: 'Google Cloud Spanner' },
      { id: 'azure_sql_database', label: 'Azure SQL Database' },
      { id: 'mongodb', label: 'MongoDB', aliases: ['mongo'] },
      { id: 'apache_cassandra', label: 'Apache Cassandra' },
      { id: 'scylladb', label: 'ScyllaDB' },
      { id: 'couchbase', label: 'Couchbase' },
      { id: 'apache_couchdb', label: 'Apache CouchDB' },
      { id: 'amazon_dynamodb', label: 'Amazon DynamoDB', aliases: ['dynamo'] },
      { id: 'azure_cosmos_db', label: 'Azure Cosmos DB' },
      { id: 'neo4j', label: 'Neo4j', aliases: ['graph'] },
      { id: 'influxdb', label: 'InfluxDB', aliases: ['time series'] },
      { id: 'timescaledb', label: 'TimescaleDB' },
      { id: 'pinecone', label: 'Pinecone', aliases: ['vector'] },
      { id: 'pgvector', label: 'pgvector', aliases: ['vector'] },
      { id: 'weaviate', label: 'Weaviate', aliases: ['vector'] },
      { id: 'qdrant', label: 'Qdrant', aliases: ['vector'] },
      { id: 'milvus', label: 'Milvus', aliases: ['vector'] },
      { id: 'chroma', label: 'Chroma', aliases: ['chromadb', 'vector'] },
      { id: 'ibm_netezza', label: 'IBM Netezza', aliases: ['netezza', 'puredata'] },
      { id: 'ibm_db2_warehouse', label: 'IBM Db2 Warehouse' },
    ],
  },
  {
    id: 'data_platform',
    label: 'Data & analytics platforms',
    nodeType: 'data_warehouse',
    items: [
      { id: 'snowflake', label: 'Snowflake' },
      { id: 'databricks', label: 'Databricks' },
      { id: 'google_bigquery', label: 'Google BigQuery', aliases: ['bq'] },
      { id: 'amazon_redshift', label: 'Amazon Redshift' },
      { id: 'azure_synapse', label: 'Azure Synapse Analytics' },
      { id: 'clickhouse', label: 'ClickHouse' },
      { id: 'apache_druid', label: 'Apache Druid' },
      { id: 'apache_spark', label: 'Apache Spark' },
      { id: 'apache_flink', label: 'Apache Flink' },
      { id: 'apache_hadoop', label: 'Apache Hadoop' },
      { id: 'apache_hive', label: 'Apache Hive' },
      { id: 'trino', label: 'Trino', aliases: ['presto'] },
      { id: 'apache_airflow', label: 'Apache Airflow' },
      { id: 'dbt', label: 'dbt' },
      { id: 'sap_bw', label: 'SAP BW' },
      { id: 'sap_datasphere', label: 'SAP Datasphere' },
      { id: 'power_bi', label: 'Microsoft Power BI' },
      { id: 'tableau', label: 'Tableau' },
      { id: 'qlik', label: 'Qlik' },
      { id: 'sap_analytics_cloud', label: 'SAP Analytics Cloud', aliases: ['sac'] },
      { id: 'aws_glue', label: 'AWS Glue' },
      { id: 'amazon_athena', label: 'Amazon Athena' },
      { id: 'amazon_emr', label: 'Amazon EMR' },
      { id: 'amazon_quicksight', label: 'Amazon QuickSight' },
      { id: 'google_dataflow', label: 'Google Dataflow' },
      { id: 'google_dataproc', label: 'Google Dataproc' },
      { id: 'google_looker', label: 'Google Looker' },
      { id: 'azure_data_factory', label: 'Azure Data Factory', aliases: ['adf'] },
      { id: 'azure_databricks', label: 'Azure Databricks' },
      { id: 'ibm_cognos', label: 'IBM Cognos Analytics', aliases: ['cognos'] },
      { id: 'tibco_spotfire', label: 'TIBCO Spotfire' },
      { id: 'tibco_streaming', label: 'TIBCO Streaming', aliases: ['streambase'] },
    ],
  },
  {
    id: 'cache',
    label: 'Caches & in-memory grids',
    nodeType: 'cache',
    items: [
      { id: 'redis', label: 'Redis' },
      { id: 'valkey', label: 'Valkey' },
      { id: 'memcached', label: 'Memcached' },
      { id: 'hazelcast', label: 'Hazelcast' },
      { id: 'apache_ignite', label: 'Apache Ignite' },
      { id: 'ehcache', label: 'Ehcache' },
      { id: 'infinispan', label: 'Infinispan' },
      { id: 'oracle_coherence', label: 'Oracle Coherence' },
      { id: 'vmware_gemfire', label: 'VMware GemFire' },
      { id: 'aerospike', label: 'Aerospike' },
      { id: 'amazon_elasticache', label: 'Amazon ElastiCache' },
      { id: 'amazon_memorydb', label: 'Amazon MemoryDB' },
      { id: 'azure_cache_redis', label: 'Azure Cache for Redis' },
      { id: 'google_memorystore', label: 'Google Cloud Memorystore' },
      { id: 'tibco_activespaces', label: 'TIBCO ActiveSpaces' },
    ],
  },
  {
    id: 'search',
    label: 'Search & log analytics',
    nodeType: 'search_index',
    items: [
      { id: 'elasticsearch', label: 'Elasticsearch', aliases: ['elastic', 'es'] },
      { id: 'opensearch', label: 'OpenSearch' },
      { id: 'apache_solr', label: 'Apache Solr' },
      { id: 'apache_lucene', label: 'Apache Lucene' },
      { id: 'splunk', label: 'Splunk' },
      { id: 'graylog', label: 'Graylog' },
      { id: 'algolia', label: 'Algolia' },
      { id: 'meilisearch', label: 'Meilisearch' },
      { id: 'typesense', label: 'Typesense' },
    ],
  },
  {
    id: 'message_broker',
    label: 'Message brokers & streaming',
    nodeType: 'message_broker',
    items: [
      { id: 'apache_kafka', label: 'Apache Kafka', aliases: ['kafka'] },
      { id: 'confluent_platform', label: 'Confluent Platform' },
      { id: 'redpanda', label: 'Redpanda' },
      { id: 'apache_pulsar', label: 'Apache Pulsar' },
      { id: 'rabbitmq', label: 'RabbitMQ', aliases: ['amqp'] },
      { id: 'apache_activemq', label: 'Apache ActiveMQ' },
      { id: 'apache_artemis', label: 'ActiveMQ Artemis' },
      { id: 'ibm_mq', label: 'IBM MQ', aliases: ['mqseries', 'websphere mq'] },
      { id: 'tibco_ems', label: 'TIBCO EMS', aliases: ['enterprise message service'] },
      { id: 'tibco_ftl', label: 'TIBCO FTL' },
      { id: 'tibco_rendezvous', label: 'TIBCO Rendezvous', aliases: ['rv'] },
      { id: 'solace_pubsub', label: 'Solace PubSub+' },
      { id: 'nats', label: 'NATS' },
      { id: 'zeromq', label: 'ZeroMQ' },
      { id: 'mqtt', label: 'MQTT' },
      { id: 'amqp', label: 'AMQP' },
      { id: 'jms', label: 'JMS' },
      { id: 'oracle_aq', label: 'Oracle AQ', aliases: ['advanced queuing'] },
      { id: 'microsoft_msmq', label: 'Microsoft MSMQ' },
      { id: 'amazon_sqs', label: 'Amazon SQS' },
      { id: 'amazon_sns', label: 'Amazon SNS' },
      { id: 'amazon_kinesis', label: 'Amazon Kinesis' },
      { id: 'amazon_eventbridge', label: 'Amazon EventBridge' },
      { id: 'azure_service_bus', label: 'Azure Service Bus' },
      { id: 'azure_event_hubs', label: 'Azure Event Hubs' },
      { id: 'google_pubsub', label: 'Google Cloud Pub/Sub' },
    ],
  },
  {
    id: 'integration',
    label: 'Integration & ESB',
    nodeType: 'esb',
    items: [
      { id: 'tibco_businessworks', label: 'TIBCO BusinessWorks', aliases: ['bw'] },
      { id: 'tibco_businessworks_5', label: 'TIBCO BusinessWorks 5', aliases: ['bw5', 'bw 5'] },
      { id: 'tibco_businessworks_6', label: 'TIBCO BusinessWorks 6', aliases: ['bw6', 'bw 6'] },
      { id: 'tibco_platform', label: 'TIBCO Platform' },
      { id: 'tibco_flogo', label: 'TIBCO Flogo' },
      { id: 'sap_ecc', label: 'SAP ECC', aliases: ['sap erp', 'r/3', 'sap r3'] },
      { id: 'sap_s4hana', label: 'SAP S/4HANA', aliases: ['s4hana', 's/4', 's4/hana'] },
      { id: 'mulesoft', label: 'MuleSoft Anypoint', aliases: ['mule'] },
      { id: 'apache_camel', label: 'Apache Camel' },
      { id: 'spring_integration', label: 'Spring Integration' },
      { id: 'ibm_ace', label: 'IBM App Connect Enterprise', aliases: ['iib', 'integration bus'] },
      { id: 'webmethods', label: 'Software AG webMethods' },
      { id: 'boomi', label: 'Boomi' },
      { id: 'sap_pi_po', label: 'SAP PI/PO', aliases: ['xi'] },
      { id: 'sap_integration_suite', label: 'SAP Integration Suite', aliases: ['cpi'] },
      { id: 'oracle_soa_suite', label: 'Oracle SOA Suite' },
      { id: 'seeburger', label: 'SEEBURGER BIS' },
      { id: 'apache_nifi', label: 'Apache NiFi' },
      { id: 'informatica', label: 'Informatica' },
      { id: 'talend', label: 'Talend' },
      { id: 'azure_logic_apps', label: 'Azure Logic Apps' },
      { id: 'aws_step_functions', label: 'AWS Step Functions' },
      { id: 'camunda', label: 'Camunda' },
      { id: 'workato', label: 'Workato' },
      { id: 'zapier', label: 'Zapier' },
      { id: 'n8n', label: 'n8n' },
      { id: 'red_hat_fuse', label: 'Red Hat Fuse', aliases: ['fuse'] },
      { id: 'ibm_sterling', label: 'IBM Sterling Integrator', aliases: ['sterling b2b integrator'] },
      { id: 'tibco_data_virtualization', label: 'TIBCO Data Virtualization', aliases: ['tdv'] },
      { id: 'google_cloud_workflows', label: 'Google Cloud Workflows' },
      { id: 'google_cloud_composer', label: 'Google Cloud Composer' },
    ],
  },
  {
    id: 'api_gateway',
    label: 'API gateways',
    nodeType: 'api_gateway',
    items: [
      { id: 'kong', label: 'Kong' },
      { id: 'google_apigee', label: 'Google Apigee' },
      { id: 'amazon_api_gateway', label: 'Amazon API Gateway' },
      { id: 'azure_api_management', label: 'Azure API Management', aliases: ['apim'] },
      { id: 'ibm_api_connect', label: 'IBM API Connect' },
      { id: 'tibco_mashery', label: 'TIBCO Mashery' },
      { id: 'wso2', label: 'WSO2 API Manager' },
      { id: 'tyk', label: 'Tyk' },
      { id: 'spring_cloud_gateway', label: 'Spring Cloud Gateway' },
      { id: 'envoy', label: 'Envoy' },
      { id: 'traefik', label: 'Traefik' },
      { id: 'red_hat_3scale', label: 'Red Hat 3scale API Management', aliases: ['3scale'] },
      { id: 'google_cloud_endpoints', label: 'Google Cloud Endpoints' },
    ],
  },
  {
    id: 'runtime',
    label: 'Languages & frameworks',
    nodeType: 'service',
    items: [
      { id: 'java', label: 'Java', aliases: ['jvm'] },
      { id: 'java_8', label: 'Java 8', aliases: ['jdk 8', 'java se 8'] },
      { id: 'java_11', label: 'Java 11', aliases: ['jdk 11', 'java se 11'] },
      { id: 'java_17', label: 'Java 17', aliases: ['jdk 17', 'java se 17'] },
      { id: 'java_21', label: 'Java 21', aliases: ['jdk 21', 'java se 21'] },
      { id: 'spring_boot', label: 'Spring Boot', aliases: ['spring'] },
      { id: 'jakarta_ee', label: 'Jakarta EE', aliases: ['java ee', 'j2ee'] },
      { id: 'quarkus', label: 'Quarkus' },
      { id: 'micronaut', label: 'Micronaut' },
      { id: 'kotlin', label: 'Kotlin' },
      { id: 'scala', label: 'Scala' },
      { id: 'groovy', label: 'Groovy' },
      { id: 'dotnet', label: '.NET', aliases: ['c#', 'csharp', '.net core', '.net 5', '.net 6', '.net 8'] },
      { id: 'dotnet_framework', label: '.NET Framework', aliases: ['.net fx', 'classic .net', '.net 4.8'] },
      { id: 'aspnet_core', label: 'ASP.NET Core' },
      { id: 'node_js', label: 'Node.js', aliases: ['node'] },
      { id: 'typescript', label: 'TypeScript', aliases: ['ts'] },
      { id: 'express', label: 'Express' },
      { id: 'nestjs', label: 'NestJS' },
      { id: 'deno', label: 'Deno' },
      { id: 'bun', label: 'Bun' },
      { id: 'python', label: 'Python' },
      { id: 'django', label: 'Django' },
      { id: 'flask', label: 'Flask' },
      { id: 'fastapi', label: 'FastAPI' },
      { id: 'go', label: 'Go', aliases: ['golang'] },
      { id: 'rust', label: 'Rust' },
      { id: 'ruby', label: 'Ruby' },
      { id: 'ruby_on_rails', label: 'Ruby on Rails', aliases: ['rails'] },
      { id: 'php', label: 'PHP' },
      { id: 'laravel', label: 'Laravel' },
      { id: 'symfony', label: 'Symfony' },
      { id: 'elixir', label: 'Elixir' },
      { id: 'erlang', label: 'Erlang' },
      { id: 'c_plus_plus', label: 'C++', aliases: ['cpp'] },
      { id: 'c_lang', label: 'C' },
      { id: 'perl', label: 'Perl' },
      { id: 'cobol', label: 'COBOL', aliases: ['mainframe'] },
      { id: 'sap_abap', label: 'SAP ABAP', aliases: ['abap'] },
      { id: 'shell', label: 'Shell', aliases: ['bash', 'script'] },
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend & mobile',
    nodeType: 'web_app',
    items: [
      { id: 'react', label: 'React' },
      { id: 'vue', label: 'Vue' },
      { id: 'angular', label: 'Angular' },
      { id: 'svelte', label: 'Svelte' },
      { id: 'next_js', label: 'Next.js' },
      { id: 'nuxt', label: 'Nuxt' },
      { id: 'astro', label: 'Astro' },
      { id: 'blazor', label: 'Blazor' },
      { id: 'jquery', label: 'jQuery' },
      { id: 'sap_fiori', label: 'SAP Fiori', aliases: ['ui5'] },
      { id: 'electron', label: 'Electron' },
      { id: 'flutter', label: 'Flutter' },
      { id: 'react_native', label: 'React Native' },
      { id: 'swift', label: 'Swift', aliases: ['ios'] },
      { id: 'android', label: 'Android' },
    ],
  },
  {
    id: 'web_server',
    label: 'Web & application servers',
    nodeType: 'server',
    items: [
      { id: 'nginx', label: 'NGINX' },
      { id: 'apache_httpd', label: 'Apache HTTP Server', aliases: ['httpd', 'apache2'] },
      { id: 'apache_tomcat', label: 'Apache Tomcat' },
      { id: 'eclipse_jetty', label: 'Eclipse Jetty' },
      { id: 'wildfly', label: 'WildFly', aliases: ['jboss'] },
      { id: 'red_hat_jboss_eap', label: 'Red Hat JBoss EAP', aliases: ['jboss eap'] },
      { id: 'ibm_websphere', label: 'IBM WebSphere Application Server', aliases: ['was', 'websphere traditional'] },
      { id: 'ibm_websphere_liberty', label: 'IBM WebSphere Liberty', aliases: ['liberty'] },
      { id: 'oracle_weblogic', label: 'Oracle WebLogic' },
      { id: 'microsoft_iis', label: 'Microsoft IIS' },
      { id: 'caddy', label: 'Caddy' },
      { id: 'haproxy', label: 'HAProxy' },
      { id: 'f5_big_ip', label: 'F5 BIG-IP' },
      { id: 'varnish', label: 'Varnish' },
    ],
  },
  {
    id: 'container',
    label: 'Containers & orchestration',
    nodeType: 'container',
    items: [
      { id: 'docker', label: 'Docker' },
      { id: 'podman', label: 'Podman' },
      { id: 'containerd', label: 'containerd' },
      { id: 'kubernetes', label: 'Kubernetes', aliases: ['k8s'] },
      { id: 'openshift', label: 'Red Hat OpenShift' },
      { id: 'helm', label: 'Helm' },
      { id: 'istio', label: 'Istio', aliases: ['service mesh'] },
      { id: 'rancher', label: 'Rancher' },
      { id: 'docker_swarm', label: 'Docker Swarm' },
      { id: 'hashicorp_nomad', label: 'HashiCorp Nomad' },
      { id: 'cloud_foundry', label: 'Cloud Foundry' },
      { id: 'amazon_ecs', label: 'Amazon ECS' },
      { id: 'amazon_eks', label: 'Amazon EKS' },
      { id: 'aws_fargate', label: 'AWS Fargate' },
      { id: 'amazon_ecr', label: 'Amazon ECR', aliases: ['elastic container registry'] },
      { id: 'azure_aks', label: 'Azure AKS' },
      { id: 'azure_container_registry', label: 'Azure Container Registry', aliases: ['acr'] },
      { id: 'azure_container_apps', label: 'Azure Container Apps' },
      { id: 'google_gke', label: 'Google GKE' },
      { id: 'google_artifact_registry', label: 'Google Artifact Registry' },
      { id: 'digitalocean_kubernetes', label: 'DigitalOcean Kubernetes', aliases: ['doks'] },
      { id: 'red_hat_quay', label: 'Red Hat Quay', aliases: ['quay'] },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud platforms',
    nodeType: 'cloud',
    items: [
      { id: 'aws', label: 'Amazon Web Services', aliases: ['aws'] },
      { id: 'azure', label: 'Microsoft Azure' },
      { id: 'google_cloud', label: 'Google Cloud', aliases: ['gcp'] },
      { id: 'ibm_cloud', label: 'IBM Cloud' },
      { id: 'oracle_cloud', label: 'Oracle Cloud', aliases: ['oci'] },
      { id: 'sap_btp', label: 'SAP BTP' },
      { id: 'alibaba_cloud', label: 'Alibaba Cloud' },
      { id: 'digitalocean', label: 'DigitalOcean' },
      { id: 'heroku', label: 'Heroku' },
      { id: 'cloudflare', label: 'Cloudflare' },
      { id: 'vercel', label: 'Vercel' },
      { id: 'netlify', label: 'Netlify' },
      { id: 'vmware_vsphere', label: 'VMware vSphere' },
      { id: 'openstack', label: 'OpenStack' },
      { id: 'on_premise', label: 'On-premise', aliases: ['data centre', 'data center'] },
    ],
  },
  {
    id: 'ci_cd',
    label: 'CI/CD & infrastructure',
    nodeType: 'ci_cd',
    items: [
      { id: 'jenkins', label: 'Jenkins' },
      { id: 'github_actions', label: 'GitHub Actions' },
      { id: 'gitlab_ci', label: 'GitLab CI' },
      { id: 'azure_devops', label: 'Azure DevOps', aliases: ['tfs'] },
      { id: 'argo_cd', label: 'Argo CD' },
      { id: 'tekton', label: 'Tekton' },
      { id: 'teamcity', label: 'TeamCity' },
      { id: 'bamboo', label: 'Atlassian Bamboo' },
      { id: 'circleci', label: 'CircleCI' },
      { id: 'spinnaker', label: 'Spinnaker' },
      { id: 'terraform', label: 'Terraform' },
      { id: 'pulumi', label: 'Pulumi' },
      { id: 'ansible', label: 'Ansible' },
      { id: 'puppet', label: 'Puppet' },
      { id: 'chef', label: 'Chef' },
      { id: 'sonarqube', label: 'SonarQube' },
      { id: 'jfrog_artifactory', label: 'JFrog Artifactory' },
      { id: 'sonatype_nexus', label: 'Sonatype Nexus' },
      { id: 'git', label: 'Git' },
      { id: 'aws_codepipeline', label: 'AWS CodePipeline' },
      { id: 'aws_codebuild', label: 'AWS CodeBuild' },
      { id: 'aws_codedeploy', label: 'AWS CodeDeploy' },
      { id: 'google_cloud_build', label: 'Google Cloud Build' },
      { id: 'red_hat_ansible_automation_platform', label: 'Red Hat Ansible Automation Platform', aliases: ['aap'] },
    ],
  },
  {
    id: 'observability',
    label: 'Monitoring & observability',
    nodeType: 'monitoring',
    items: [
      { id: 'prometheus', label: 'Prometheus' },
      { id: 'grafana', label: 'Grafana' },
      { id: 'grafana_loki', label: 'Grafana Loki' },
      { id: 'elastic_stack', label: 'Elastic Stack', aliases: ['elk'] },
      { id: 'logstash', label: 'Logstash' },
      { id: 'fluentd', label: 'Fluentd' },
      { id: 'opentelemetry', label: 'OpenTelemetry', aliases: ['otel'] },
      { id: 'jaeger', label: 'Jaeger' },
      { id: 'zipkin', label: 'Zipkin' },
      { id: 'datadog', label: 'Datadog' },
      { id: 'new_relic', label: 'New Relic' },
      { id: 'dynatrace', label: 'Dynatrace' },
      { id: 'appdynamics', label: 'AppDynamics' },
      { id: 'sentry', label: 'Sentry' },
      { id: 'nagios', label: 'Nagios' },
      { id: 'zabbix', label: 'Zabbix' },
      { id: 'checkmk', label: 'Checkmk' },
      { id: 'pagerduty', label: 'PagerDuty' },
      { id: 'tibco_hawk', label: 'TIBCO Hawk' },
      { id: 'itrs_geneos', label: 'ITRS Geneos', aliases: ['geneos', 'itrs'] },
      { id: 'ibm_tivoli', label: 'IBM Tivoli Monitoring', aliases: ['tivoli', 'itm'] },
      { id: 'amazon_cloudwatch', label: 'Amazon CloudWatch' },
      { id: 'azure_monitor', label: 'Azure Monitor' },
      { id: 'google_cloud_operations', label: 'Google Cloud Operations Suite', aliases: ['stackdriver'] },
    ],
  },
  {
    id: 'identity',
    label: 'Identity & secrets',
    nodeType: 'identity_provider',
    items: [
      { id: 'keycloak', label: 'Keycloak' },
      { id: 'okta', label: 'Okta' },
      { id: 'auth0', label: 'Auth0' },
      { id: 'microsoft_entra_id', label: 'Microsoft Entra ID', aliases: ['azure ad', 'aad'] },
      { id: 'active_directory', label: 'Active Directory', aliases: ['ad'] },
      { id: 'ldap', label: 'LDAP' },
      { id: 'kerberos', label: 'Kerberos' },
      { id: 'ping_identity', label: 'Ping Identity' },
      { id: 'forgerock', label: 'ForgeRock' },
      { id: 'oauth2', label: 'OAuth 2.0', aliases: ['oauth'] },
      { id: 'openid_connect', label: 'OpenID Connect', aliases: ['oidc'] },
      { id: 'saml', label: 'SAML' },
      { id: 'hashicorp_vault', label: 'HashiCorp Vault' },
      { id: 'cyberark', label: 'CyberArk' },
      { id: 'aws_iam', label: 'AWS IAM' },
      { id: 'aws_secrets_manager', label: 'AWS Secrets Manager' },
      { id: 'aws_kms', label: 'AWS KMS', aliases: ['key management service'] },
      { id: 'aws_cognito', label: 'Amazon Cognito' },
      { id: 'azure_key_vault', label: 'Azure Key Vault' },
      { id: 'google_cloud_iam', label: 'Google Cloud IAM' },
      { id: 'red_hat_sso', label: 'Red Hat Single Sign-On', aliases: ['rh-sso'] },
    ],
  },
  {
    id: 'storage',
    label: 'Object & file storage',
    nodeType: 'object_storage',
    items: [
      { id: 'amazon_s3', label: 'Amazon S3', aliases: ['s3'] },
      { id: 'azure_blob_storage', label: 'Azure Blob Storage' },
      { id: 'google_cloud_storage', label: 'Google Cloud Storage', aliases: ['gcs'] },
      { id: 'minio', label: 'MinIO' },
      { id: 'ceph', label: 'Ceph' },
      { id: 'apache_hdfs', label: 'Apache HDFS' },
      { id: 'netapp', label: 'NetApp' },
      { id: 'nfs', label: 'NFS' },
      { id: 'smb', label: 'SMB / Samba', aliases: ['cifs', 'samba'] },
      { id: 'sftp', label: 'SFTP' },
      { id: 'ftp', label: 'FTP' },
      { id: 'as2', label: 'AS2', aliases: ['edi'] },
      { id: 'microsoft_sharepoint', label: 'Microsoft SharePoint' },
      { id: 'digitalocean_spaces', label: 'DigitalOcean Spaces' },
      { id: 'azure_files', label: 'Azure Files' },
      { id: 'ibm_cloud_object_storage', label: 'IBM Cloud Object Storage' },
    ],
  },
  {
    id: 'cloud_compute',
    label: 'Cloud compute & serverless',
    nodeType: 'serverless_function',
    items: [
      { id: 'amazon_ec2', label: 'Amazon EC2', aliases: ['ec2'] },
      { id: 'aws_lambda', label: 'AWS Lambda', aliases: ['lambda'] },
      { id: 'aws_elastic_beanstalk', label: 'AWS Elastic Beanstalk' },
      { id: 'aws_app_runner', label: 'AWS App Runner' },
      { id: 'amazon_lightsail', label: 'Amazon Lightsail' },
      { id: 'google_compute_engine', label: 'Google Compute Engine', aliases: ['gce'] },
      { id: 'google_app_engine', label: 'Google App Engine', aliases: ['gae'] },
      { id: 'google_cloud_run', label: 'Google Cloud Run' },
      { id: 'google_cloud_functions', label: 'Google Cloud Functions' },
      { id: 'azure_virtual_machines', label: 'Azure Virtual Machines', aliases: ['azure vm'] },
      { id: 'azure_app_service', label: 'Azure App Service' },
      { id: 'azure_functions', label: 'Azure Functions' },
      { id: 'digitalocean_droplets', label: 'DigitalOcean Droplets', aliases: ['droplet'] },
      { id: 'digitalocean_app_platform', label: 'DigitalOcean App Platform' },
      { id: 'digitalocean_functions', label: 'DigitalOcean Functions' },
      { id: 'ibm_cloud_functions', label: 'IBM Cloud Functions' },
      { id: 'ibm_cloud_code_engine', label: 'IBM Cloud Code Engine' },
      { id: 'oracle_cloud_functions', label: 'Oracle Cloud Functions' },
    ],
  },
  {
    id: 'ai_ml',
    label: 'AI & ML platforms',
    nodeType: 'ml_model',
    items: [
      { id: 'amazon_sagemaker', label: 'Amazon SageMaker', aliases: ['sagemaker'] },
      { id: 'amazon_bedrock', label: 'Amazon Bedrock', aliases: ['bedrock'] },
      { id: 'google_vertex_ai', label: 'Google Vertex AI', aliases: ['vertex ai'] },
      { id: 'azure_openai_service', label: 'Azure OpenAI Service', aliases: ['azure openai'] },
      { id: 'azure_machine_learning', label: 'Azure Machine Learning', aliases: ['azure ml'] },
      { id: 'ibm_watsonx', label: 'IBM watsonx', aliases: ['watson', 'watsonx'] },
      { id: 'openai_api', label: 'OpenAI API', aliases: ['openai', 'gpt', 'chatgpt'] },
      { id: 'anthropic_api', label: 'Anthropic Claude', aliases: ['anthropic', 'claude'] },
      { id: 'google_gemini', label: 'Google Gemini', aliases: ['gemini'] },
      { id: 'huggingface', label: 'Hugging Face' },
      { id: 'langchain', label: 'LangChain' },
      { id: 'llamaindex', label: 'LlamaIndex' },
      { id: 'mlflow', label: 'MLflow' },
      { id: 'kubeflow', label: 'Kubeflow' },
    ],
  },
]

export const TECH_ITEMS: TechItem[] = TECH_CATEGORIES.flatMap((category) => category.items)

const byId = new Map(TECH_ITEMS.map((item) => [item.id, item]))
const categoryById = new Map(TECH_CATEGORIES.map((category) => [category.id, category]))
const categoryByTech = new Map(
  TECH_CATEGORIES.flatMap((category) => category.items.map((item) => [item.id, category])),
)

/**
 * Technologies a user typed in that the built-in catalogue does not carry —
 * "Add as technology" in the picker pushes here instead of being lost the
 * moment the node is deselected. Kept in the browser, not the diagram file:
 * a node that uses one still just stores its id like any other tech.
 */
export const CUSTOM_TECH_CATEGORY_ID = 'custom'
const CUSTOM_STORAGE_KEY = 'baugraph:custom-tech:v1'

function readCustomTech(): TechItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is TechItem =>
        !!entry && typeof entry.id === 'string' && typeof entry.label === 'string',
    )
  } catch {
    return []
  }
}

function writeCustomTech() {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customTech))
  } catch {
    // Quota or private-mode failures are not worth interrupting the user for.
  }
}

export const customTech = reactive<TechItem[]>(readCustomTech())

/** Adds a user-typed technology and returns it, reusing an existing one of the same name. */
export function addCustomTech(label: string): TechItem {
  const trimmed = label.trim()
  const existing = [...TECH_ITEMS, ...customTech].find(
    (item) => item.label.toLowerCase() === trimmed.toLowerCase(),
  )
  if (existing) return existing

  const id = uniqueId(
    slugify(trimmed, 'tech').replace(/-/g, '_'),
    [...byId.keys(), ...customTech.map((item) => item.id)],
  )
  const item: TechItem = { id, label: trimmed }
  customTech.push(item)
  writeCustomTech()
  return item
}

export function removeCustomTech(id: string) {
  const index = customTech.findIndex((item) => item.id === id)
  if (index < 0) return
  customTech.splice(index, 1)
  writeCustomTech()
}

export function techItem(id?: string | null): TechItem | undefined {
  if (!id) return undefined
  return byId.get(id) ?? customTech.find((item) => item.id === id)
}

export function techCategory(id?: string | null): TechCategory | undefined {
  return id ? categoryById.get(id) : undefined
}

/** The category a technology belongs to, e.g. `postgresql` → Databases. */
export function categoryOfTech(id?: string | null): TechCategory | undefined {
  return id ? categoryByTech.get(id) : undefined
}

/**
 * Turns `some_unknown_thing` into `Some unknown thing`, so an id this catalogue
 * has never seen still reads as a name rather than vanishing from the node.
 */
export function humanise(id: string): string {
  const words = id.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

/** Display name for a technology id. Unknown ids are humanised, never dropped. */
export function techLabel(id?: string | null): string {
  if (!id) return ''
  return techItem(id)?.label ?? humanise(id)
}

/** Every term a search box should match an entry on. */
export function techTerms(item: TechItem): string[] {
  return [item.id, item.label, ...(item.aliases ?? [])]
}

export function matchesTech(item: TechItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return techTerms(item).some((term) => term.toLowerCase().includes(q))
}

/**
 * Floats one category to the top of a list — the one a node's type suggests, so
 * a database node opens on databases rather than on whatever sorts first.
 */
export function categoryFirst<T extends { id: string }>(groups: T[], id?: string | null): T[] {
  if (!id) return groups
  const index = groups.findIndex((group) => group.id === id)
  const target = index > 0 ? groups[index] : undefined
  if (!target) return groups
  return [target, ...groups.slice(0, index), ...groups.slice(index + 1)]
}

/** Categories filtered by a search box, empty ones dropped. */
export function searchTech(query: string, first?: string | null): TechCategory[] {
  const matched = TECH_CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter((item) => matchesTech(item, query)),
  })).filter((category) => category.items.length > 0)
  return categoryFirst(matched, first)
}

/**
 * The built-in catalogue plus a trailing "Custom" category for whatever a user
 * has typed in — wherever a technology is picked from a list of categories,
 * this is that list, so a custom entry is reachable the same way a built-in
 * one is.
 */
export const techCategoriesWithCustom = computed<TechCategory[]>(() =>
  customTech.length
    ? [
        ...TECH_CATEGORIES,
        {
          id: CUSTOM_TECH_CATEGORY_ID,
          label: 'Custom',
          nodeType: 'service',
          items: customTech,
        },
      ]
    : TECH_CATEGORIES,
)
