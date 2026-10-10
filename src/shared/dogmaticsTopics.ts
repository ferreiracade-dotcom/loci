// The topics of dogmatics, in the traditional order of the loci, each with the English, Latin
// and German words its book and section titles use. A book whose title names a topic is a
// treatment of it; so is a section whose title names one, inside a book on something else (the
// way Pieper treats Baptism inside the Means of Grace). Matching titles, not text, keeps a
// topic to the places a dogmatician actually takes it up rather than everywhere it is mentioned.

export interface DogmaticsTopic {
  id: string
  name: string
  pattern: RegExp
}

const t = (id: string, name: string, pattern: RegExp): DogmaticsTopic => ({ id, name, pattern })

export const DOGMATICS_TOPICS: DogmaticsTopic[] = [
  t('prolegomena', 'Prolegomena: Theology and Religion', /prolegomen|\bof theology\b|nature of theology|de theologia|natura theologiae|\breligion|fundamental articles|articles of faith/i),
  t('scripture', 'Holy Scripture', /scriptur|\bword of god\b|verbo dei|verbum dei|heilige schrift|inspiration|\bcanon/i),
  t('god', 'God and His Attributes', /^(?:(?:on|of|concerning)\s+)?(?:the\s+)?god\.?$|\bde deo\b|(?:nature|essence|existence|knowledge|names|unity) of god|attributes|attributis|von gott\b/i),
  t('trinity', 'The Holy Trinity', /trinit|three persons|tribus personis|dreieinig|dreifaltig/i),
  t('creation', 'Creation', /creation|creatione|schöpfung|hexa[eë]mer/i),
  t('angels', 'Angels and Devils', /angel|engel|\bdevils?\b|diabol|\bdemons?\b|satan/i),
  t('providence', 'Providence', /providen|vorsehung|preservation of|conservatione|concurs|government of (?:the )?(?:world|all things)/i),
  t('man', 'Man and the Image of God', /image of god|imagine dei|ebenbild|state of integrity|primeval state|\bof man\b|de homine|creation of man|\bsoul\b/i),
  t('sin', 'Sin', /\bsins?\b|peccat|sünde|\bfall of\b|de lapsu/i),
  t('free-will', 'Free Will', /free will|freedom of the will|libero arbitrio|liberum arbitrium|freie[rn]? will/i),
  t('person-of-christ', 'The Person of Christ', /person of christ|persona christi|incarnat|two natures|duabus naturis|hypostatic|personal union|unione personali|communicat\w* (?:of )?(?:the )?(?:idiom|attribut|propert)|christolog|\bde christo\b|^(?:(?:on|of)\s+)?christ\.?$/i),
  t('work-of-christ', 'The Work of Christ', /office of christ|officio christi|work of christ|(?:prophetic|priestly|kingly|royal) office|humiliation|exaltation|exinanit|atonement|reconcil|redemption|redemptione|satisfaction|satisfactione|descent into hell|descensu/i),
  t('grace', 'Grace and Predestination', /election|predestin|praedestin|electione|gnadenwahl|reprobation|grace of god|gratia dei|universal grace|will of god (?:for|to) salvation/i),
  t('holy-spirit', 'The Holy Spirit', /holy (?:spirit|ghost)|spiritu sancto|heilige[rn]? geist/i),
  t('means-of-grace', 'The Means of Grace', /means of grace|mediis gratiae|mediis salutis|gnadenmittel/i),
  t('law', 'The Law', /\blaws?\b|\blege\b|\blegis\b|gesetz|commandment|decalog|praecept/i),
  t('gospel', 'The Gospel', /gospel|evangeli/i),
  t('call', 'Call and Illumination', /\bcall\b|calling|vocatione|berufung|illuminat|erleuchtung/i),
  t('conversion', 'Conversion and Regeneration', /conversion|conversione|bekehrung|regenerat|wiedergeburt|new birth/i),
  t('repentance', 'Repentance, Confession and Absolution', /repentance|p(?:o|oe|œ)nitenti|penitence|\bbu(?:ss|ß)e\b|contrition|contritione|absolution|private confession|confession and absolution/i),
  t('faith', 'Faith', /\bfaith\b|\bfide[im]?\b|\bglaube/i),
  t('justification', 'Justification', /justif|iustific|rechtfertigung/i),
  t('sanctification', 'Sanctification and the Mystical Union', /sanctific|renovat|renewal|heiligung|mystical union|unio(?:ne)? mystica|new obedience|nova obedientia/i),
  t('good-works', 'Good Works', /good works|bonis operibus|bona opera|gute werke/i),
  t('sacraments', 'The Sacraments', /sacrament|sakrament/i),
  t('baptism', 'Baptism', /baptis|baptiz|\btaufe/i),
  t('lords-supper', "The Lord's Supper", /lord'?s supper|holy supper|(?:sacred|holy) communion|c(?:o|oe)ena|eucharist|abendmahl|sacrament of the altar|real presence/i),
  t('church', 'The Church', /church|ecclesia|\bkirche|communion of saints/i),
  t('ministry', 'The Ministry', /ministry|ministerio|ministerium|predigtamt|ordination|\bkeys\b|clavibus|\bpastor/i),
  t('government', 'Civil Government', /magistra|civil (?:government|authority|order)|political|politico|obrigkeit/i),
  t('marriage', 'Marriage and the Household', /marriage|matrimon|conjug|coniug|\behe\b|household|domestic|celibacy|coelibatu/i),
  t('prayer', 'Prayer', /prayer|oratione|precibus|\bgebet/i),
  t('death', 'Death', /\bdeath\b|\bmorte\b|\btod\b|immortal|intermediate state/i),
  t('resurrection', 'The Resurrection of the Dead', /resurrect|auferstehung/i),
  t('judgment', 'The Last Judgment', /judgm|iudicio|judicio|\bgericht|second coming|return of christ|advent of christ/i),
  t('consummation', 'The End of the World', /end of the world|consummat|fine mundi|weltende/i),
  t('eternal-life', 'Heaven and Hell', /eternal (?:life|death|damnation)|vita aeterna|morte aeterna|\bheaven|(?<!into )\bhell\b|inferno|damnat|ewige[sn]? leben|hölle|glory of the blessed/i),
  t('antichrist', 'Antichrist', /antichrist/i)
]

const byId = new Map(DOGMATICS_TOPICS.map((x) => [x.id, x]))

export function dogmaticsTopic(id: string): DogmaticsTopic | undefined {
  return byId.get(id)
}

/** The topics a book or section title names, in the order of the loci. */
export function topicsOf(title: string): string[] {
  if (!title.trim()) return []
  return DOGMATICS_TOPICS.filter((x) => x.pattern.test(title)).map((x) => x.id)
}
