// Prévias de 27/11/2026; a disposição tática é ilustrativa.
export const finalLineups = [
  {
    name:'Palmeiras',coach:'Abel Ferreira',formation:'3-4-3',asOf:'27/11/2026',
    sourceUrl:'https://ge.globo.com/futebol/times/palmeiras/noticia/2026/11/26/escalacao-palmeiras-corre-contra-o-tempo-para-ter-murilo-e-piquerez-na-final-da-libertadores.ghtml',sourceLabel:'ge · prévia atualizada em 27/11',
    players:[
      {name:'Carlos Miguel',position:'Goleiro',row:0},
      {name:'Murilo',position:'Zagueiro',row:1},
      {name:'Gustavo Gómez',position:'Zagueiro',row:1},
      {name:'Alexander Barboza',position:'Zagueiro',row:1},
      {name:'Agustín Giay',position:'Ala',row:2},
      {name:'Marlon Freitas',position:'Meio-campista',row:2},
      {name:'Lucas Evangelista',position:'Meio-campista',row:2},
      {name:'Joaquín Piquerez',position:'Ala',row:2},
      {name:'Jhon Arias',position:'Atacante',row:3},
      {name:'Vitor Roque',position:'Atacante',row:3},
      {name:'Flaco López',position:'Atacante',row:3}
    ]
  },
  {
    name:'Estudiantes',coach:'Alexander “Cacique” Medina',formation:'4-4-2',asOf:'27/11/2026',
    sourceUrl:'https://www.uol.com.br/esporte/futebol/colunas/mauro-cezar-pereira/2026/11/27/estudiantes-ensaia-mudanca-na-defesa-para-a-final-contra-o-palmeiras.htm',sourceLabel:'UOL · Mauro Cezar, 27/11',
    players:[
      {name:'Fernando Muslera',position:'Goleiro',row:0},
      {name:'Eros Mancuso',position:'Defensor',row:1},
      {name:'Santiago Núñez',position:'Zagueiro',row:1},
      {name:'Leandro González Pírez',position:'Zagueiro',row:1},
      {name:'Marcos Rojo',position:'Defensor',row:1},
      {name:'Fabricio Pérez',position:'Meio-campista nesta formação',row:2},
      {name:'Ezequiel Piovi',position:'Meio-campista',row:2},
      {name:'Alexis Castro',position:'Meio-campista',row:2},
      {name:'Joaquín Tobio Burgos',position:'Meio-campista',row:2},
      {name:'Tiago Palacios',position:'Atacante nesta formação',row:3},
      {name:'Guido Carrillo',position:'Atacante',row:3}
    ]
  }
];

// Alternativas da delegação; o banco da súmula ainda não está confirmado.
finalLineups[0].bench = [
  {name:'Marcelo Lomba',position:'Goleiro'},
  {name:'Benedetti',position:'Zagueiro'},
  {name:'Bruno Fuchs',position:'Zagueiro'},
  {name:'Khellven',position:'Lateral'},
  {name:'Arthur',position:'Lateral'},
  {name:'Andreas Pereira',position:'Meio-campista'},
  {name:'Emiliano Martínez',position:'Volante'},
  {name:'Larson',position:'Volante'},
  {name:'Erick Belé',position:'Meia'},
  {name:'Felipe Anderson',position:'Meia'},
  {name:'Mauricio',position:'Meia'},
  {name:'Ramón Sosa',position:'Atacante'},
  {name:'Bruno Bertinato',position:'Goleiro',status:'Corte previsto pela imprensa'},
  {name:'Luis Pacheco',position:'Volante',status:'Corte previsto pela imprensa'},
  {name:'Heittor',position:'Atacante',status:'Corte previsto pela imprensa'},
  {name:'Fabiano',position:'Atacante',status:'Corte previsto pela imprensa'},
  {name:'Paulinho',position:'Atacante',available:false,status:'Sem condição de jogo'}
];
finalLineups[1].bench = [
  {name:'Fabricio Iacovich',position:'Goleiro'},
  {name:'Rodrigo Borzone',position:'Goleiro'},
  {name:'Ramiro Funes Mori',position:'Defensor'},
  {name:'Tomás Palacios',position:'Defensor'},
  {name:'Santiago Arzamendia',position:'Defensor'},
  {name:'Gastón Benedetti',position:'Defensor'},
  {name:'Eric Meza',position:'Defensor'},
  {name:'José Sosa',position:'Meio-campista'},
  {name:'Bautista Kociubinski',position:'Meio-campista'},
  {name:'Jalil Elias',position:'Meio-campista'},
  {name:'Miguel Monsalve',position:'Meio-campista'},
  {name:'Brian Aguirre',position:'Meio-campista'},
  {name:'Joaquín Correa',position:'Meio-campista',status:'Em recuperação; disponibilidade em avaliação'},
  {name:'Edwuin Cetré',position:'Atacante'},
  {name:'Lucas Alario',position:'Atacante'},
  {name:'Adolfo Gaich',position:'Atacante'},
  {name:'Baltasar Rodríguez',position:'Meio-campista',available:false,status:'Suspenso'}
];
