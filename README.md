# NostWard

**NostWard** es un sistema que permite conectar eventos del protocolo **Nostr** con aplicaciones externas mediante webhooks.

## Funcionalidades principales

1. **Suscripciones**  
   Permite a los usuarios suscribirse a eventos de Nostr utilizando filtros personalizados y recibir notificaciones vía webhooks.

2. **Gestión de créditos**  
   Implementa un sistema basado en créditos para controlar las notificaciones enviadas a los webhooks.

3. **Integración con Lightning Network**  
   Los créditos se pueden comprar utilizando pagos Lightning, alineándose con la filosofía descentralizada del protocolo Nostr.

## Documentación de endpoints

### Créditos
- [**Buy Credits**](./api-doc/credits/buy_credits.md)  
  Endpoint para realizar solicitudes de compra de créditos.

### Suscripciones
- [**Create Subscription**](./api-doc/subscriptions/create_subscription.md)  
  Crea una nueva suscripción para recibir eventos.  
