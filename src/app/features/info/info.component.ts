import { Component } from '@angular/core';
import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina/encabezado-pagina.component';

export const INSTAGRAM_URL = 'https://www.instagram.com/yon3rvi_esp/';
export const WHATSAPP_URL = 'https://wa.me/18292555768';
export const TELEFONO = '+1 (829) 255-5768';

@Component({
  selector: 'app-info',
  imports: [EncabezadoPaginaComponent],
  templateUrl: './info.component.html',
})
export class InfoComponent {}