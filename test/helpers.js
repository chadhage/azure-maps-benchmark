export function addressCase(overrides = {}) {
  return {
    id: 'case-1',
    query: '100 Example St, Testville',
    category: 'partial',
    expected: {
      address: { addressLine: '100 Example St', locality: 'Testville' },
      source: 'Synthetic test oracle; not a real address'
    },
    ...overrides
  };
}

export function candidate(overrides = {}) {
  return {
    rank: 1,
    address: { addressLine: '100 Example St', locality: 'Testville', countryRegion: 'US' },
    formattedAddress: '100 Example St, Testville',
    position: [-73.98, 40.75],
    confidence: 'High',
    matchCodes: ['Good'],
    entityType: 'Address',
    calculationMethod: 'Rooftop',
    ...overrides
  };
}

export function feature(overrides = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-73.98, 40.75] },
    properties: {
      address: {
        addressLine: '100 Example St',
        locality: 'Testville',
        countryRegion: { ISO: 'US', name: 'United States' },
        adminDistricts: [{ shortName: 'NY' }],
        formattedAddress: '100 Example St, Testville'
      },
      confidence: 'High',
      matchCodes: ['Good'],
      type: 'Address',
      geocodePoints: [{
        geometry: { type: 'Point', coordinates: [-73.98, 40.75] },
        calculationMethod: 'Rooftop',
        usageTypes: ['Display']
      }]
    },
    ...overrides
  };
}
