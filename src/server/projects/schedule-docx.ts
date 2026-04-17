import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

export type ScheduleDocxDay = {
  dateNote: string;
  slots: Array<{ intervalText: string; description: string }>;
};

export async function buildScheduleDocxBuffer(args: {
  projectTitle: string;
  days: ScheduleDocxDay[];
}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: args.projectTitle, bold: true, size: 32 })],
    }),
    new Paragraph({
      children: [new TextRun("Тайминг-сценарий")],
    }),
  ];

  for (const day of args.days) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: day.dateNote, bold: true, size: 28 })],
      }),
    );

    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Интервал", bold: true })] })],
        }),
        new TableCell({
          children: [
            new Paragraph({ children: [new TextRun({ text: "Описание сценария", bold: true })] }),
          ],
        }),
      ],
    });

    const dataRows =
      day.slots.length > 0
        ? day.slots.map(
            (s) =>
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun(s.intervalText)] })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun(s.description)] })],
                  }),
                ],
              }),
          )
        : [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun("—")] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun("—")] })] }),
              ],
            }),
          ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      }),
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
