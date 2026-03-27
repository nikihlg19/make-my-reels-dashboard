export interface ParsedLocation {
  address: string;
  mainText: string;
  placeId?: string;
}

export const parseLocation = (locStr?: string | null): ParsedLocation => {
  if (!locStr) return { address: '', mainText: '' };
  try {
    const loc = JSON.parse(locStr);
    if (loc && loc.address) {
      return { 
        address: loc.address, 
        mainText: loc.mainText || loc.address.split(',')[0], 
        placeId: loc.placeId 
      };
    }
  } catch (e) {
    // Legacy string format
  }
  return { address: locStr, mainText: locStr };
};
