export const users = [
  { id: 'admin1', name: 'Admin User', email: 'admin@milk.com', password: 'admin123', role: 'admin' },
  { id: 'boy1', name: 'Ravi Kumar', email: 'ravi@milk.com', password: '123456', role: 'delivery', areaId: 'area1', onLeave: false },
  { id: 'boy2', name: 'Suresh Reddy', email: 'suresh@milk.com', password: '123456', role: 'delivery', areaId: 'area2', onLeave: false },
  { id: 'boy3', name: 'Mahesh Rao', email: 'mahesh@milk.com', password: '123456', role: 'delivery', areaId: 'area3', onLeave: false },
];

export const areas = [
  { id: 'area1', name: 'Tirupati North', active: true },
  { id: 'area2', name: 'Tirupati Central', active: true },
  { id: 'area3', name: 'Tirupati South', active: true },
];

export const customers = [
  { id: 'c1', name: 'Anil Kumar', phone: '9876500011', address: '12-4, North Street', areaId: 'area1', defaultBoyId: 'boy1', milkQuantity: '1 L', ratePerLitre: 60, active: true },
  { id: 'c2', name: 'Lakshmi Devi', phone: '9876500012', address: '18-2, North Street', areaId: 'area1', defaultBoyId: 'boy1', milkQuantity: '500 ml', ratePerLitre: 62, active: true },
  { id: 'c3', name: 'Prakash Rao', phone: '9876500013', address: '42, Temple Road', areaId: 'area1', defaultBoyId: 'boy1', milkQuantity: '1 L', ratePerLitre: 60, active: true },
  { id: 'c4', name: 'Meena Sharma', phone: '9876500014', address: '8-11, Main Road', areaId: 'area2', defaultBoyId: 'boy2', milkQuantity: '1.5 L', ratePerLitre: 60, active: true },
  { id: 'c5', name: 'Ramesh Babu', phone: '9876500015', address: '22, Gandhi Road', areaId: 'area2', defaultBoyId: 'boy2', milkQuantity: '1 L', ratePerLitre: 60, active: true },
  { id: 'c6', name: 'Kiran Kumar', phone: '9876500016', address: '7-3, Market Lane', areaId: 'area2', defaultBoyId: 'boy2', milkQuantity: '500 ml', ratePerLitre: 60, active: true },
  { id: 'c7', name: 'Sunitha Rao', phone: '9876500017', address: '31, Lake View', areaId: 'area3', defaultBoyId: 'boy3', milkQuantity: '1 L', ratePerLitre: 60, active: true },
  { id: 'c8', name: 'Vijay Kumar', phone: '9876500018', address: '14, Railway Colony', areaId: 'area3', defaultBoyId: 'boy3', milkQuantity: '1 L', ratePerLitre: 60, active: true },
  { id: 'c9', name: 'Deepa Reddy', phone: '9876500019', address: '5, Green Park', areaId: 'area3', defaultBoyId: 'boy3', milkQuantity: '500 ml', ratePerLitre: 60, active: true },
];
