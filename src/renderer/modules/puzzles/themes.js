// Turkish names for Lichess puzzle themes, grouped for the theme picker.
export const THEME_TR = {
  // motifler
  fork: 'Çatal', pin: 'Açmaz', skewer: 'Şiş', discoveredAttack: 'Açarak saldırı', discoveredCheck: 'Açarak şah',
  doubleCheck: 'Çifte şah', deflection: 'Saptırma', attraction: 'Çekme', clearance: 'Yol açma', interference: 'Araya girme',
  intermezzo: 'Ara hamle', sacrifice: 'Fedalar', hangingPiece: 'Korumasız taş', trappedPiece: 'Kapana kısılmış taş',
  capturingDefender: 'Savunanı alma', xRayAttack: 'X-ışını', quietMove: 'Sessiz hamle', defensiveMove: 'Savunma hamlesi',
  zugzwang: 'Zugzwang', advancedPawn: 'İlerlemiş piyon', promotion: 'Terfi', underPromotion: 'Alt terfi',
  exposedKing: 'Açık şah', kingsideAttack: 'Şah kanadı saldırısı', queensideAttack: 'Vezir kanadı saldırısı',
  attackingF2F7: 'f2/f7 saldırısı', enPassant: 'Geçerken alma', castling: 'Rok', collinearMove: 'Aynı hatta hamle',
  // matlar
  mate: 'Mat', mateIn1: '1 hamlede mat', mateIn2: '2 hamlede mat', mateIn3: '3 hamlede mat', mateIn4: '4 hamlede mat', mateIn5: '5+ hamlede mat',
  backRankMate: 'Arka sıra matı', smotheredMate: 'Boğmaca mat', anastasiaMate: 'Anastasia matı', arabianMate: 'Arap matı',
  bodenMate: 'Boden matı', doubleBishopMate: 'Çift fil matı', dovetailMate: 'Kırlangıç kuyruğu matı', hookMate: 'Kanca matı',
  operaMate: 'Opera matı', pillsburysMate: 'Pillsbury matı', epauletteMate: 'Apolet matı', cornerMate: 'Köşe matı',
  swallowstailMate: 'Kırlangıç matı', triangleMate: 'Üçgen matı', morphysMate: 'Morphy matı', killBoxMate: 'Kutu matı',
  blindSwineMate: 'Kör domuzlar matı', vukovicMate: 'Vukovic matı', balestraMate: 'Balestra matı',
  // oyun evresi
  opening: 'Açılış', middlegame: 'Oyun ortası', endgame: 'Oyun sonu', rookEndgame: 'Kale oyun sonu',
  pawnEndgame: 'Piyon oyun sonu', bishopEndgame: 'Fil oyun sonu', knightEndgame: 'At oyun sonu',
  queenEndgame: 'Vezir oyun sonu', queenRookEndgame: 'Vezir-kale oyun sonu',
  // hedef ve uzunluk
  crushing: 'Ezici avantaj', advantage: 'Avantaj', equality: 'Eşitlik', oneMove: 'Tek hamle', short: 'Kısa',
  long: 'Uzun', veryLong: 'Çok uzun', master: 'Usta oyunu', masterVsMaster: 'Ustalar arası', superGM: 'Süper GM oyunu',
};

export const THEME_GROUPS = [
  ['Motifler', ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'deflection', 'attraction',
    'clearance', 'interference', 'intermezzo', 'sacrifice', 'hangingPiece', 'trappedPiece', 'capturingDefender', 'xRayAttack',
    'quietMove', 'defensiveMove', 'zugzwang', 'advancedPawn', 'promotion', 'underPromotion', 'exposedKing', 'kingsideAttack',
    'queensideAttack', 'attackingF2F7', 'enPassant']],
  ['Matlar', ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'smotheredMate', 'anastasiaMate',
    'arabianMate', 'bodenMate', 'doubleBishopMate', 'dovetailMate', 'hookMate', 'operaMate', 'pillsburysMate', 'epauletteMate']],
  ['Oyun evresi', ['opening', 'middlegame', 'endgame', 'rookEndgame', 'pawnEndgame', 'bishopEndgame', 'knightEndgame', 'queenEndgame', 'queenRookEndgame']],
  ['Uzunluk', ['oneMove', 'short', 'long', 'veryLong']],
];

export const themeName = (t) => THEME_TR[t] || t;
