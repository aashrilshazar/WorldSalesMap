// Configuration constants
const CONFIG = {
    STORAGE_KEY: 'peFirms',
    SOURCE_KEY: 'peFirmsSource',
    STAGE_NAMES: [
        'No Contact',
        'Initial Engagement',
        'Broader Demo Evaluation (NDA, POC, Pilot)',
        'Validation (Docs Uploaded)',
        'Commercials (Contract Negotiations)',
        'Decision (Exploring Others)',
        'Closed Won',
        'Closed Lost'
    ],
    STAGE_COLORS: [
        '#64748b','#6366f1','#4f46e5','#2563eb',
        '#0ea5e9','#06b6d4','#10b981','#ef4444'
    ],
    CITY_COORDS: {
        'New York': [40.7128,-74.0060],
        'London': [51.5074,-0.1278],
        'Paris': [48.8566,2.3522],
        'San Francisco': [37.7749,-122.4194],
        'Boston': [42.3601,-71.0589],
        'Chicago': [41.8781,-87.6298],
        'Miami': [25.7617,-80.1918],
        'Luxembourg': [49.6117,6.1319],
        'Tel Aviv': [32.0853,34.7818],
        'Hong Kong': [22.3193,114.1694],
        'Sydney': [-33.8688,151.2093],
        'Beijing': [39.9042,116.4074],
        'Dubai': [25.2048,55.2708],
        'Toronto': [43.6532,-79.3832],
        'Zurich': [47.3769,8.5417],
        'Denver': [39.7392,-104.9903],
        'Seattle': [47.6062,-122.3321],
        'Austin': [30.2672,-97.7431],
        'Los Angeles': [34.0522,-118.2437],
        'Munich': [48.1351,11.5820]
    },
    CITY_TO_COUNTRY: {
        'New York':'USA','San Francisco':'USA','Boston':'USA',
        'Chicago':'USA','Miami':'USA','Denver':'USA',
        'Seattle':'USA','Austin':'USA','Los Angeles':'USA',
        'London':'GBR','Paris':'FRA','Luxembourg':'LUX',
        'Tel Aviv':'ISR','Hong Kong':'CHN','Sydney':'AUS',
        'Beijing':'CHN','Dubai':'ARE','Toronto':'CAN',
        'Zurich':'CHE','Munich':'DEU'
    },
    COUNTRY_IDS: {
        840:'USA',826:'GBR',250:'FRA',442:'LUX',376:'ISR',
        156:'CHN',36:'AUS',784:'ARE',124:'CAN',756:'CHE',276:'DEU'
    }
};