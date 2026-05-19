export const APP_URL = 'https://buildyournetwork.online';
export const APP_NAME = 'Build Your Network';
export const APP_DESCRIPTION = 'The professional networking app built for founders, builders, and ambitious professionals in India.';
export const OG_IMAGE = `${APP_URL}/assets/logo.png`;

export interface CityData {
  name: string;
  state: string;
  ecosystem: string;
  hubs: string;
  excerpt: string;
}

export const CITIES: Record<string, CityData> = {
  hyderabad:         { name: 'Hyderabad',         state: 'Telangana',       ecosystem: 'biotech, pharma, IT services, and deep tech',                       hubs: 'T-Hub, NASSCOM Hyderabad, and IIT Hyderabad',                             excerpt: "Hyderabad is home to T-Hub, one of Asia's largest startup incubators, and a rapidly growing ecosystem of tech, biotech, and deep-tech startups." },
  bengaluru:         { name: 'Bengaluru',          state: 'Karnataka',       ecosystem: 'SaaS, AI/ML, fintech, consumer internet, and deep tech',             hubs: 'NASSCOM CoE, IISc, IIMB NSRCEL, and a dense VC ecosystem',               excerpt: "Bengaluru is India's Silicon Valley with the highest density of tech startups, angel investors, and VC firms in the country." },
  mumbai:            { name: 'Mumbai',             state: 'Maharashtra',     ecosystem: 'fintech, D2C, media, edtech, and healthcare',                       hubs: 'IIT Bombay STP, WeWork Labs, and a large angel investor network',         excerpt: "Mumbai is India's financial capital and home to a thriving fintech and D2C startup ecosystem." },
  delhi:             { name: 'Delhi / NCR',        state: 'Delhi',           ecosystem: 'edtech, logistics, enterprise SaaS, and e-commerce',               hubs: 'IIT Delhi, NASSCOM 10000 Startups, and Delhi Startup Hub',               excerpt: "Delhi NCR is India's second-largest startup hub, anchored by Gurugram and Noida." },
  pune:              { name: 'Pune',               state: 'Maharashtra',     ecosystem: 'manufacturing tech, SaaS, automotive, and edtech',                 hubs: 'Venture Center, College of Engineering Pune, and Persistent Systems',     excerpt: "Pune combines a large student population from top engineering colleges with proximity to Mumbai's capital markets." },
  chennai:           { name: 'Chennai',            state: 'Tamil Nadu',      ecosystem: 'hardware, deep tech, automotive, and health tech',                  hubs: 'IIT Madras Research Park, NASSCOM Chennai, and SIPCOT IT Park',          excerpt: "Chennai has one of India's strongest deep-tech and hardware startup ecosystems, anchored by IIT Madras Research Park." },
  kolkata:           { name: 'Kolkata',            state: 'West Bengal',     ecosystem: 'fintech, agritech, social impact, and e-commerce',                 hubs: 'IIT Kharagpur, Bengal Startup, and Calcutta Innovation Hub',             excerpt: "Kolkata is an emerging startup hub with strength in fintech, agritech, and social impact ventures." },
  ahmedabad:         { name: 'Ahmedabad',          state: 'Gujarat',         ecosystem: 'fintech, MSME tech, manufacturing, and agritech',                  hubs: 'GUSEC, IIM Ahmedabad CIIE, and GIFT City',                              excerpt: "Ahmedabad is the entrepreneurial capital of Gujarat — a state with the highest density of small-business owners in India." },
  jaipur:            { name: 'Jaipur',             state: 'Rajasthan',       ecosystem: 'travel tech, fashion tech, handicraft e-commerce, and edtech',      hubs: 'iStart Rajasthan, IIT Jodhpur, and Jaipur Startup Ecosystem',            excerpt: "Jaipur is India's fastest-growing Tier 2 startup hub with strength in travel tech, fashion tech, and e-commerce." },
  kochi:             { name: 'Kochi',              state: 'Kerala',          ecosystem: 'tourism tech, sustainability, fintech, and health tech',            hubs: 'Kerala Startup Mission (KSUM), Startup Village, and Infopark',           excerpt: "Kochi leads Kerala's startup ecosystem driven by Kerala Startup Mission, one of India's most active state-run startup programs." },
  gurgaon:           { name: 'Gurgaon',            state: 'Haryana',         ecosystem: 'fintech, edtech, enterprise SaaS, HR tech, and mobility',           hubs: 'Awfis, WeWork Gurgaon, and the Cyber City startup corridor',             excerpt: "Gurgaon (Gurugram) is the corporate and startup spine of Delhi NCR." },
  noida:             { name: 'Noida',              state: 'Uttar Pradesh',   ecosystem: 'IT services, gaming, edtech, e-commerce, and media tech',           hubs: 'STPI Noida, Amity University, and the Sector 62 tech corridor',          excerpt: "Noida is the technology backbone of Delhi NCR, anchored by a dense IT services cluster." },
  chandigarh:        { name: 'Chandigarh',         state: 'Punjab',          ecosystem: 'IT services, health tech, agritech, and clean energy',              hubs: 'PEC University Startup Hub, IT Park Chandigarh, and STPI Chandigarh',    excerpt: "Chandigarh anchors the Punjab-Haryana startup corridor with a strong IT services base." },
  coimbatore:        { name: 'Coimbatore',         state: 'Tamil Nadu',      ecosystem: 'manufacturing tech, textiles, engineering, and IoT',                hubs: 'PSG-STEP, CODISSIA, and Amrita School of Business',                      excerpt: "Coimbatore is Tamil Nadu's industrial powerhouse — home to thousands of engineering MSMEs." },
  surat:             { name: 'Surat',              state: 'Gujarat',         ecosystem: 'diamond tech, textile fintech, MSME digitisation, and logistics',   hubs: 'SVNIT Surat Incubation and Surat Diamond Bourse',                        excerpt: "Surat is India's diamond and textile trading capital, generating $30B+ in annual trade." },
  visakhapatnam:     { name: 'Visakhapatnam',      state: 'Andhra Pradesh',  ecosystem: 'pharma, IT services, blue economy, and logistics',                  hubs: 'Andhra University Tech Park and Vizag Fintech Valley',                   excerpt: "Visakhapatnam (Vizag) is Andhra Pradesh's technology gateway, anchored by Fintech Valley." },
  indore:            { name: 'Indore',             state: 'Madhya Pradesh',  ecosystem: 'manufacturing tech, fintech, MSME digitisation, and agritech',      hubs: 'IIT Indore, Indore Smart City Lab, and NASSCOM Indore Chapter',          excerpt: "Indore is emerging as central India's startup capital." },
  nagpur:            { name: 'Nagpur',             state: 'Maharashtra',     ecosystem: 'agritech, logistics, clean energy, and orange economy',             hubs: 'VNIT Nagpur Incubation Centre and MIHAN Special Economic Zone',          excerpt: "Nagpur sits at India's geographic center and is a critical logistics node." },
  lucknow:           { name: 'Lucknow',            state: 'Uttar Pradesh',   ecosystem: 'edtech, agritech, fintech, and government-tech',                   hubs: 'IIM Lucknow and Lucknow Startup Hub',                                    excerpt: "Lucknow is Uttar Pradesh's rising startup hub." },
  bhopal:            { name: 'Bhopal',             state: 'Madhya Pradesh',  ecosystem: 'agritech, manufacturing tech, smart city solutions, and edtech',   hubs: 'MANIT Bhopal Tech Hub and MP Startup Policy Centre',                     excerpt: "Bhopal is Madhya Pradesh's startup gateway." },
  thiruvananthapuram: { name: 'Thiruvananthapuram', state: 'Kerala',         ecosystem: 'space tech, IT services, health tech, and clean energy',            hubs: 'Kerala Startup Mission, Technopark, and IIST',                           excerpt: "Thiruvananthapuram is home to ISRO and Technopark." },
  mysuru:            { name: 'Mysuru',             state: 'Karnataka',       ecosystem: 'IT services, tourism tech, heritage tech, and health tech',         hubs: 'KITS Mysuru and University of Mysore Incubation',                        excerpt: "Mysuru combines a large IT services workforce with a growing startup ecosystem." },
  kota:              { name: 'Kota',               state: 'Rajasthan',       ecosystem: 'edtech, coaching tech, fintech for students, and e-learning',       hubs: 'Allen Career Institute and iStart Kota',                                 excerpt: "Kota is India's coaching capital — educating over 200,000 students annually." },
};

export interface IndustryData {
  name: string;
  description: string;
  tags: string[];
  faqs: { q: string; a: string }[];
}

export const INDUSTRIES: Record<string, IndustryData> = {
  saas: {
    name: 'SaaS',
    description: 'Software-as-a-Service founders, product managers, and engineers',
    tags: ['Product', 'Engineering', 'Growth', 'Sales', 'Customer Success'],
    faqs: [
      { q: 'How do I find SaaS co-founders on BYN?', a: 'Set your intent to "Find Co-founder", add SaaS and your tech stack as skills, and enable discovery. BYN surfaces SaaS founders with complementary skills near you or nationwide.' },
      { q: 'Can I find SaaS investors on Build Your Network?', a: 'Yes. Filter by intent "Investment Opportunities" to connect with angel investors and VCs actively looking for SaaS deals in India.' },
    ],
  },
  fintech: {
    name: 'Fintech',
    description: 'Fintech founders, engineers, compliance experts, and investors',
    tags: ['Payments', 'Lending', 'WealthTech', 'InsurTech', 'Compliance'],
    faqs: [
      { q: 'Where can fintech founders network in India?', a: 'Build Your Network is the best place for fintech founders to connect with engineers, compliance advisors, and investors. Filter by Fintech interest to find the right people.' },
      { q: 'How do I find a fintech co-founder?', a: 'Create a BYN profile, set your skills (payments, lending, regulatory), and set intent to "Find Co-founder". BYN matches you with complementary fintech builders.' },
    ],
  },
  'ai-ml': {
    name: 'AI / ML',
    description: 'AI researchers, ML engineers, and applied AI product builders',
    tags: ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'MLOps'],
    faqs: [
      { q: 'How do I network with AI engineers in India?', a: 'BYN has a growing community of AI/ML engineers and researchers. Add AI / ML to your interests and set your intent to find the collaborators you need.' },
      { q: 'Where can AI founders find technical co-founders?', a: 'Build Your Network matches AI founders with ML engineers based on shared skills and intent. Filter by location or search nationwide.' },
    ],
  },
  ecommerce: {
    name: 'E-commerce',
    description: 'D2C founders, marketplace builders, and e-commerce operators',
    tags: ['D2C', 'Marketplace', 'Logistics', 'Supply Chain', 'Growth'],
    faqs: [
      { q: 'How do I find e-commerce collaborators on BYN?', a: 'Set E-commerce as your interest on BYN and set your intent. You will be matched with D2C founders, logistics experts, and growth marketers building in the space.' },
      { q: 'Can I find investors for my D2C brand on Build Your Network?', a: 'Yes. Many angel investors on BYN are actively looking for D2C investment opportunities. Set your intent to "Find Investors" to surface them.' },
    ],
  },
  healthtech: {
    name: 'HealthTech',
    description: 'Health tech founders, doctors-turned-entrepreneurs, and med-tech builders',
    tags: ['Digital Health', 'MedTech', 'Telemedicine', 'Health Data', 'Pharma'],
    faqs: [
      { q: 'How do I network with healthtech founders in India?', a: 'Add HealthTech to your BYN profile interests and enable discovery. You will be matched with doctors, health tech engineers, and investors focused on healthcare.' },
    ],
  },
  edtech: {
    name: 'EdTech',
    description: 'EdTech founders, educators, and learning product builders',
    tags: ['Online Learning', 'Skill Development', 'K-12', 'Higher Education', 'Assessment'],
    faqs: [
      { q: 'Where can EdTech founders network in India?', a: 'Build Your Network has a strong EdTech community. Add EdTech to your interests and connect with founders, educators, and EdTech investors.' },
    ],
  },
  agritech: {
    name: 'AgriTech',
    description: 'AgriTech founders, agronomists, and rural tech builders',
    tags: ['Precision Farming', 'Agri-Fintech', 'Cold Chain', 'Farm-to-Market', 'Crop Tech'],
    faqs: [
      { q: 'How do I find AgriTech co-founders in India?', a: 'BYN matches AgriTech founders with agronomists, engineers, and rural market experts based on shared interests and location — including Tier 2 cities.' },
    ],
  },
  'web3': {
    name: 'Web3 / Crypto',
    description: 'Web3 founders, blockchain developers, and DeFi builders',
    tags: ['Blockchain', 'DeFi', 'NFT', 'Smart Contracts', 'DAO'],
    faqs: [
      { q: 'Where can Web3 builders network in India?', a: 'Build Your Network has an active Web3 community. Add Web3 / Crypto to your interests and connect with blockchain developers, DeFi founders, and crypto investors.' },
    ],
  },
};

export interface RoleData {
  name: string;
  description: string;
  lookingFor: string[];
  faqs: { q: string; a: string }[];
}

export const ROLES: Record<string, RoleData> = {
  'product-manager': {
    name: 'Product Manager',
    description: 'Product managers, CPOs, and product-led founders',
    lookingFor: ['Engineers', 'Designers', 'Co-founders', 'Mentors', 'Investors'],
    faqs: [
      { q: 'How can product managers network in India?', a: 'Build Your Network matches PMs with engineers, designers, and other product leaders based on intent. Add "Product Management" as a skill and start discovering.' },
      { q: 'Where do PMs find co-founders to build startups?', a: 'BYN is the best place for PMs to find technical co-founders. Set intent to "Find Co-founder" and specify your skills — BYN surfaces matched engineers and designers.' },
    ],
  },
  founder: {
    name: 'Founder',
    description: 'Startup founders at every stage, from idea to Series B+',
    lookingFor: ['Co-founders', 'Engineers', 'Investors', 'Advisors', 'Early customers'],
    faqs: [
      { q: 'What is the best networking app for startup founders in India?', a: 'Build Your Network (BYN) is purpose-built for founders. Unlike LinkedIn, BYN matches you with co-founders, investors, and advisors based on your startup stage and intent.' },
      { q: 'How do I find a co-founder in India?', a: 'Create a BYN profile, set intent to "Find Co-founder", add your skills, and enable discovery. BYN surfaces founders with complementary skills within your radius or nationwide.' },
    ],
  },
  engineer: {
    name: 'Software Engineer',
    description: 'Developers and engineers looking to build, collaborate, or co-found',
    lookingFor: ['Co-founders', 'PMs', 'Designers', 'Interesting projects', 'Startup roles'],
    faqs: [
      { q: 'How can software engineers find startup co-founders?', a: 'Add your tech stack to BYN skills, set intent to "Find Co-founder" or "Find Opportunities", and enable discovery. BYN matches you with non-technical founders who need your expertise.' },
    ],
  },
  designer: {
    name: 'Designer',
    description: 'UX/UI designers, design leads, and design-focused founders',
    lookingFor: ['Engineers', 'Co-founders', 'Freelance clients', 'Design-led startups'],
    faqs: [
      { q: 'How do designers network with startup founders on BYN?', a: 'Add Design as a skill, set intent to "Find Clients" or "Find Co-founder", and BYN will surface startup founders actively looking for design talent and collaboration.' },
    ],
  },
  'growth-marketer': {
    name: 'Growth Marketer',
    description: 'Growth hackers, performance marketers, and CMOs',
    lookingFor: ['Startups to join', 'Co-founders', 'Consulting clients', 'Marketing tools'],
    faqs: [
      { q: 'How do growth marketers find startups to work with on BYN?', a: 'Set your skills to Growth, Marketing, and SEO, and intent to "Find Clients" or "Find Opportunities". BYN matches you with founders actively looking for growth expertise.' },
    ],
  },
  investor: {
    name: 'Investor',
    description: 'Angel investors, VCs, and family offices looking for deals',
    lookingFor: ['Founders', 'Deal flow', 'Co-investors', 'Sector experts'],
    faqs: [
      { q: 'How do investors find startups on Build Your Network?', a: 'Set intent to "Investment Opportunities" on BYN and filter by sector interests. Founders actively seeking investment will appear in your discovery feed.' },
      { q: 'Can investors use BYN to source deals?', a: 'Yes. BYN\'s intent-based matching surfaces founders who are explicitly looking for investment, reducing cold outreach noise.' },
    ],
  },
  mentor: {
    name: 'Mentor',
    description: 'Experienced operators and founders offering mentorship',
    lookingFor: ['Early-stage founders to guide', 'Advisory board roles', 'Community'],
    faqs: [
      { q: 'How do mentors connect with founders on BYN?', a: 'Set intent to "Mentorship" on BYN. Founders actively looking for mentors will appear in your feed, and you can connect with those whose stage and sector match your expertise.' },
    ],
  },
  freelancer: {
    name: 'Freelancer',
    description: 'Freelance developers, designers, writers, and consultants',
    lookingFor: ['Startup clients', 'Long-term projects', 'Referral networks'],
    faqs: [
      { q: 'How do freelancers find startup clients on BYN?', a: 'Set intent to "Find Clients" and add your skills. BYN surfaces startup founders who need freelance help — without the competition of traditional freelance platforms.' },
    ],
  },
};
