const CHARACTERS = {
  mina:  { nameEN: 'Mina',  nameTH: 'มินา',  avatar: '👩', color: '#E8A0BF' },
  kai:   { nameEN: 'Kai',   nameTH: 'ไค',    avatar: '👨', color: '#A0C4E8' },
  ploy:  { nameEN: 'Ploy',  nameTH: 'พลอย', avatar: '🧑', color: '#B8E8A0' },
};

export default function handler(req, res) {
  res.json(Object.entries(CHARACTERS).map(([id, c]) => ({ id, ...c })));
}
