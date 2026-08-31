-- Migration 002: Comunidades Autónomas de España
-- Tabla maestra con sus respectivas leyes marco de urbanismo

CREATE TABLE IF NOT EXISTS comunidades_autonomas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL UNIQUE,
  competencia_urbanistica TEXT NOT NULL,
  ley_marco_vigente TEXT NOT NULL,
  fecha_publicacion DATE,
  enlace_boe_o_boletin_autonomico TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE comunidades_autonomas IS 'Comunidades Autónomas de España con su normativa urbanística principal';
COMMENT ON COLUMN comunidades_autonomas.competencia_urbanistica IS 'Descripción de la competencia urbanística de la comunidad autónoma';
COMMENT ON COLUMN comunidades_autonomas.ley_marco_vigente IS 'Nombre de la ley marco vigente de suelo y urbanismo';

INSERT INTO comunidades_autonomas (nombre, competencia_urbanistica, ley_marco_vigente, fecha_publicacion, enlace_boe_o_boletin_autonomico) VALUES
(
  'Andalucía',
  'Competencia plena en materia de urbanismo según Estatuto de Autonomía. Regula el suelo, la ordenación del territorio y el urbanismo en todo su ámbito. La Comunidad Autónoma establece el marco general y los municipios ejercen las competencias de gestión urbanística.',
  'Ley 7/2007, de 13 de marzo, de Suelo de Andalucía',
  '2007-03-14',
  'https://www.boe.es/boe/dias/2007/04/14/pdfs/A16414-16459.pdf'
),
(
  'Aragón',
  'Competencia exclusiva en urbanismo según Estatuto de Autonomía. Regula la ordenación del territorio, el urbanismo y la vivienda. Establece el régimen de suelo y urbanismo aplicable en la comunidad.',
  'Ley 13/2015, de 9 de julio, de Suelo de Aragón',
  '2015-07-10',
  'https://www.boe.es/boe/dias/2015/07/31/pdfs/BOE-A-2015-8389.pdf'
),
(
  'Asturias',
  'Competencia exclusiva en materia de urbanismo y ordenación del territorio. El Principado de Asturias ejerce sus competencias a través de la Consejería de Infraestructuras, Territorio y Vivienda.',
  'Ley 3/2002, de 22 de marzo, de Suelo del Principado de Asturias',
  '2002-03-25',
  'https://www.bopa.es/pdf/2002/072/26042002.pdf'
),
(
  'Islas Baleares',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Regula el régimen de suelo, la planificación urbanística y la disciplina urbanística. La normativa insular tiene especial relevancia por la carácter insular del territorio.',
  'Ley 12/2017, de 26 de diciembre, de Suelo de las Islas Baleares',
  '2017-12-27',
  'https://www.boe.es/boe/dias/2018/01/20/pdfs/BOE-A-2018-708.pdf'
),
(
  'Canarias',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Regula el régimen especial de suelo de Canarias, adaptado a las peculiaridades insulares y a la conservación del medio natural.',
  'Ley 4/1997, de 4 de diciembre, de Suelo de Canarias',
  '1997-12-05',
  'https://www.gobcan.es/boocan/1997/241/004.html'
),
(
  'Cantabria',
  'Competencia exclusiva en urbanismo según Estatuto de Autonomía. Regula el suelo, la ordenación del territorio y el régimen urbanístico de la comunidad.',
  'Ley 2/2001, de 25 de junio, de Suelo y Régimen Urbanístico del Suelo de Cantabria',
  '2001-06-26',
  'https://www.boe.es/boe/dias/2001/07/24/pdfs/A27424-27449.pdf'
),
(
  'Castilla y León',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Establece el marco general de la normativa urbanística y de suelo para toda la comunidad autónoma, con competencias delegadas a los municipios.',
  'Ley 8/2001, de 13 de diciembre, de Suelo y Urbanismo de Castilla y León',
  '2001-12-14',
  'https://www.boe.es/boe/dias/2002/01/15/pdfs/A1270-1289.pdf'
),
(
  'Castilla-La Mancha',
  'Competencia exclusiva en urbanismo. Regula el régimen de suelo, la ordenación del territorio y la disciplina urbanística en toda la comunidad autónoma.',
  'Ley 9/2006, de 28 de diciembre, de Suelo y Urbanismo de Castilla-La Mancha',
  '2006-12-29',
  'https://www.boe.es/boe/dias/2007/01/30/pdfs/A4324-4344.pdf'
),
(
  'Cataluña',
  'Competencia exclusiva en urbanismo y ordenación del territorio. El sistema urbanístico catalán tiene características propias como la figura del planeamiento territorial y la disciplina urbanística propias.',
  'Ley 19/2003, de 4 de diciembre, de régimen urbanístico y valoraciones de Cataluña (actualizada por Ley 13/2015)',
  '2003-12-05',
  'https://www.boe.es/boe/dias/2004/01/10/pdfs/A1517-1552.pdf'
),
(
  'Extremadura',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Regula el régimen de suelo, la planificación urbanística y la disciplina urbanística en la comunidad.',
  'Ley 15/2001, de 14 de diciembre, del Suelo y Ordenación Territorial de Extremadura',
  '2001-12-15',
  'https://www.boe.es/boe/dias/2002/01/28/pdfs/A3528-3549.pdf'
),
(
  'Galicia',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Regula el suelo, la planificación urbanística y la disciplina urbanística con especificidades propias como el suelo rústico de especial protección.',
  'Ley 2/2016, del 10 de febrero, del suelo de Galicia',
  '2016-02-11',
  'https://www.boe.es/boe/dias/2016/03/05/pdfs/BOE-A-2016-2414.pdf'
),
(
  'La Rioja',
  'Competencia exclusiva en urbanismo. Regula el suelo, la vivienda y el urbanismo en toda la comunidad autónoma.',
  'Ley 8/2004, de 19 de octubre, de Suelo, Vivienda y Urbanismo de La Rioja',
  '2004-10-20',
  'https://www.boe.es/boe/dias/2004/11/20/pdfs/A38960-38982.pdf'
),
(
  'Comunidad de Madrid',
  'Competencia exclusiva en urbanismo. Regula el suelo, la rehabilitación urbana y la disciplina urbanística en la comunidad. El sistema urbanístico madrileño tiene particularidades como la figura del Plan Regional.',
  'Texto Refundido de la Ley de Suelo y Rehabilitación Urbana de la Comunidad de Madrid (Decreto Legislativo 1/2010)',
  '2010-10-01',
  'https://www.boe.es/boe/dias/2010/11/20/pdfs/BOE-A-2010-17636.pdf'
),
(
  'Región de Murcia',
  'Competencia exclusiva en urbanismo, ordenación del territorio y paisaje. Regula el régimen de suelo, la planificación urbanística y la disciplina urbanística.',
  'Ley 13/2015, de 31 de marzo, de Ordenación del Territorio, Urbanismo y Paisaje de la Región de Murcia',
  '2015-04-01',
  'https://www.boe.es/boe/dias/2015/04/29/pdfs/BOE-A-2015-4645.pdf'
),
(
  'Comunidad Foral de Navarra',
  'Competencia exclusiva en urbanismo. Regula el urbanismo y el suelo en la comunidad foral, con un sistema de planificación propio.',
  'Ley 35/2002, de 4 de diciembre, foral de Urbanismo de Navarra',
  '2002-12-05',
  'https://www.boe.es/boe/dias/2002/12/31/pdfs/A45096-45121.pdf'
),
(
  'País Vasco',
  'Competencia exclusiva en urbanismo. Regula el suelo y el urbanismo en la comunidad autónoma, con un sistema de planificación urbanística propio.',
  'Ley 1/2010, de 1 de julio, de Suelo y Urbanismo del País Vasco',
  '2010-07-02',
  'https://www.boe.es/boe/dias/2010/07/23/pdfs/BOE-A-2010-11203.pdf'
),
(
  'Comunitat Valenciana',
  'Competencia exclusiva en urbanismo y ordenación del territorio. Regula el ordenamiento del territorio, la disciplina urbanística y el régimen de suelo en la comunidad.',
  'Ley 5/2014, de 25 de julio, de Ordenación del Territorio, Urbanismo y Paisaje de la Comunitat Valenciana',
  '2014-07-26',
  'https://www.boe.es/boe/dias/2014/08/23/pdfs/BOE-A-2014-8811.pdf'
);
