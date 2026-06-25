export class DomainsParser {
  static parse(content: string): string[] {
    const domains = new Set<string>();
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Ignorar comentários e linhas vazias
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        continue;
      }

      // Validar se parece com um domínio DNS (opcional, já que a lista é controlada, mas ajuda na sanitização)
      const domain = trimmed.toLowerCase().replace(/^www\./, "");
      
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        domains.add(domain);
      }
    }

    return [...domains];
  }
}
