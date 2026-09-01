class PersonStatusCard extends HTMLElement {
  // Expose the editor element to Home Assistant
  static async getConfigElement() {
    return document.createElement('person-status-card-editor');
  }

  // Define default configuration values for new cards
  static getStubConfig() {
    return {
      person_entity: '',
      home_zone: 'home',
      work_zone: 'work'
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.innerHTML = `<ha-card></ha-card>`;
      this.content = this.querySelector('ha-card');
      
      // Tap Action: Open More-Info dialog for person entity on click
      this.content.addEventListener('click', () => {
        if (this.config && this.config.person_entity) {
          const event = new Event('hass-more-info', {
            bubbles: true,
            composed: true,
          });
          event.detail = { entityId: this.config.person_entity };
          this.dispatchEvent(event);
        }
      });
    }

    const config = this.config;
    if (!config.person_entity || !hass.states[config.person_entity]) return;

    const personObj = hass.states[config.person_entity];

    // Entity States & Config
    const name = config.name || personObj.attributes.friendly_name || 'Person';
    const avatar = config.image || personObj.attributes.entity_picture;
    const rawState = personObj.state ? personObj.state.toLowerCase() : '';

    // Zone Configuration (Defaults to 'home' and 'work')
    const homeZone = (config.home_zone || 'home').toLowerCase();
    const workZone = (config.work_zone || 'work').toLowerCase();

    // Determine Display Location Name & Status Color
    let locationName = personObj.state;
    let statusColor = '#2196f3'; // Blue for arbitrary zones

    if (rawState === homeZone) {
      locationName = 'Home';
      statusColor = '#4caf50'; // Green
    } else if (rawState === workZone) {
      locationName = 'Work';
      statusColor = '#ff9800'; // Orange
    } else if (rawState === 'not_home') {
      locationName = 'Away';
      statusColor = '#9e9e9e'; // Grey
    } else if (personObj.state) {
      locationName = personObj.state.charAt(0).toUpperCase() + personObj.state.slice(1);
    }
    
    const phoneBattery = config.phone_battery ? hass.states[config.phone_battery] : null;
    const phoneBatteryState = config.phone_battery_state ? hass.states[config.phone_battery_state] : null;
    
    const watchBattery = config.watch_battery ? hass.states[config.watch_battery] : null;
    const watchBatteryState = config.watch_battery_state ? hass.states[config.watch_battery_state] : null;

    const steps = config.steps_entity ? hass.states[config.steps_entity] : null;

    // Smart Commute Routing Logic
    let commuteEntity = null;
    if (rawState === homeZone && config.commute_to_work) {
      commuteEntity = hass.states[config.commute_to_work];
    } else if (config.commute_to_home) {
      commuteEntity = hass.states[config.commute_to_home];
    }

    // Helper: Format Travel Time
    const formatTravelTime = (rawVal) => {
      const num = parseFloat(rawVal);
      if (isNaN(num)) return rawVal;

      if (num >= 60) {
        const hours = Math.floor(num / 60);
        const mins = parseFloat((num % 60).toFixed(1));
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
      return `${parseFloat(num.toFixed(1))}m`;
    };

    // Helper: Battery Icon based on charging state and level
    const getBatteryIcon = (pct, isCharging) => {
      if (isCharging) return 'mdi:battery-charging-100';
      if (pct >= 90) return 'mdi:battery';
      if (pct >= 70) return 'mdi:battery-70';
      if (pct >= 50) return 'mdi:battery-50';
      if (pct >= 30) return 'mdi:battery-30';
      if (pct >= 10) return 'mdi:battery-10';
      return 'mdi:battery-outline';
    };

    // Helper: Robust Charging State Check
    const checkIsCharging = (batteryEntity, stateEntity) => {
      // 1. Check dedicated battery state sensor if supplied
      if (stateEntity && stateEntity.state) {
        const s = stateEntity.state.toLowerCase();
        if (['charging', 'plugged', 'wireless', 'ac', 'usb', 'charging (usb)', 'charging (ac)', 'charging (wireless)'].includes(s)) {
          return true;
        }
      }

      // 2. Fallback to main battery entity state and attributes
      if (batteryEntity) {
        const mainState = batteryEntity.state ? batteryEntity.state.toLowerCase() : '';
        const isChargingAttr = batteryEntity.attributes ? batteryEntity.attributes.is_charging : false;
        const chargerType = batteryEntity.attributes ? batteryEntity.attributes.charger_type : null;
        
        if (mainState === 'charging' || isChargingAttr === true || (chargerType && chargerType !== 'none' && chargerType !== 'discharging')) {
          return true;
        }
      }

      return false;
    };

    // Build Metrics Array
    const metrics = [];

    if (phoneBattery) {
      const val = Math.min(Math.max(parseFloat(phoneBattery.state) || 0, 0), 100);
      const isCharging = checkIsCharging(phoneBattery, phoneBatteryState);
      metrics.push({
        type: 'battery',
        deviceIcon: 'mdi:cellphone',
        batteryIcon: getBatteryIcon(val, isCharging),
        value: `${val}%`,
        pct: val,
        isCharging: isCharging,
        color: isCharging ? '#00e676' : (val <= 20 ? '#f44336' : '#4caf50')
      });
    }

    if (watchBattery) {
      const val = Math.min(Math.max(parseFloat(watchBattery.state) || 0, 0), 100);
      const isCharging = checkIsCharging(watchBattery, watchBatteryState);
      metrics.push({
        type: 'battery',
        deviceIcon: 'mdi:watch-variant',
        batteryIcon: getBatteryIcon(val, isCharging),
        value: `${val}%`,
        pct: val,
        isCharging: isCharging,
        color: isCharging ? '#00e676' : (val <= 20 ? '#f44336' : '#4caf50')
      });
    }

    if (steps) {
      const val = parseFloat(steps.state);
      if (!isNaN(val) && val < 1000) {
        metrics.push({
          type: 'standard',
          icon: 'mdi:walk',
          value: Math.round(steps.state),
          color: '#03a9f4'
        });
      } else {
        metrics.push({
          type: 'standard',
          icon: 'mdi:walk',
          value: isNaN(val) ? steps.state : `${(val / 1000).toFixed(1)}k`,
          color: '#03a9f4'
        });
      }
    }

    if (commuteEntity) {
      metrics.push({
        type: 'standard',
        icon: 'mdi:car',
        value: formatTravelTime(commuteEntity.state),
        color: '#ff9800'
      });
    }

    // Render Component
    this.content.innerHTML = `
      <style>
        ha-card {
          padding: 12px;
          background: var(--card-background-color, #1c1c1e);
          border-radius: 12px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s ease;
        }
        ha-card:hover {
          background: var(--ha-card-hover-background, #242427);
        }
        .card-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .avatar-wrap {
          position: relative;
          width: 40px;
          height: 40px;
        }
        .avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }
        .status-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid var(--card-background-color, #1c1c1e);
          background-color: ${statusColor};
        }
        .info {
          display: flex;
          flex-direction: column;
        }
        .name {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--primary-text-color, #fff);
        }
        .location {
          font-size: 0.75rem;
          color: var(--secondary-text-color, #aaa);
        }
        .metrics-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          position: relative;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 4px 8px;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.75rem;
          font-weight: 600;
          overflow: hidden;
        }
        .battery-bar {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          opacity: 0.25;
          border-radius: 8px 0 0 8px;
          pointer-events: none;
          transition: width 0.3s ease;
        }
        /* Charging Shimmer Animation */
        .battery-bar.charging {
          opacity: 0.45;
          background-size: 200% 100%;
          animation: chargingPulse 1.8s infinite linear;
        }
        @keyframes chargingPulse {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .chip-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        ha-icon {
          --mdc-icon-size: 14px;
        }
      </style>

      <div class="card-container">
        <div class="header">
          <div class="avatar-wrap">
            <img class="avatar" src="${avatar}" alt="${name}" />
            <div class="status-dot"></div>
          </div>
          <div class="info">
            <span class="name">${name}</span>
            <span class="location">${locationName}</span>
          </div>
        </div>

        ${metrics.length > 0 ? `
          <div class="metrics-row">
            ${metrics.map(m => `
              <div class="chip">
                ${m.type === 'battery' ? `
                  <div class="battery-bar ${m.isCharging ? 'charging' : ''}" 
                       style="width: ${m.pct}%; ${m.isCharging 
                         ? `background: linear-gradient(90deg, ${m.color} 0%, rgba(255,255,255,0.8) 50%, ${m.color} 100%); background-size: 200% 100%;` 
                         : `background-color: ${m.color};`}">
                  </div>
                ` : ''}
                <div class="chip-content">
                  ${m.type === 'battery' ? `
                    <ha-icon icon="${m.deviceIcon}" style="color: var(--secondary-text-color, #aaa); margin-right: 1px;"></ha-icon>
                  ` : `
                    <ha-icon icon="${m.icon}" style="color: ${m.color}"></ha-icon>
                  `}
                  <span>${m.value}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  setConfig(config) {
    if (!config.person_entity) {
      throw new Error('You need to define a person_entity');
    }
    this.config = config;
  }

  getCardSize() {
    return 1;
  }
}

// Register Custom Card Component
customElements.define('person-status-card', PersonStatusCard);


/* ====================================================================
   LOVELACE VISUAL CARD EDITOR
   ==================================================================== */
class PersonStatusCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._haForm) {
      this._haForm.hass = hass;
    }
  }

  render() {
    if (!this._config) return;

    if (!this._haForm) {
      this.innerHTML = ``;
      this._haForm = document.createElement('ha-form');
      this._haForm.hass = this._hass;
      this._haForm.data = this._config;
      this._haForm.schema = this._getSchema();
      this._haForm.computeLabel = this._computeLabel;
      
      this._haForm.addEventListener('value-changed', (ev) => {
        this._config = ev.detail.value;
        const event = new Event('config-changed', {
          bubbles: true,
          composed: true,
        });
        event.detail = { config: this._config };
        this.dispatchEvent(event);
      });

      this.appendChild(this._haForm);
    } else {
      this._haForm.data = this._config;
    }
  }

  _getSchema() {
    return [
      { name: 'person_entity', selector: { entity: { domain: 'person' } } },
      { name: 'name', selector: { text: {} } },
      { name: 'image', selector: { text: {} } },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'home_zone', selector: { text: {} } },
          { name: 'work_zone', selector: { text: {} } }
        ]
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'phone_battery', selector: { entity: { domain: 'sensor' } } },
          { name: 'phone_battery_state', selector: { entity: { domain: 'sensor' } } }
        ]
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'watch_battery', selector: { entity: { domain: 'sensor' } } },
          { name: 'watch_battery_state', selector: { entity: { domain: 'sensor' } } }
        ]
      },
      { name: 'steps_entity', selector: { entity: { domain: 'sensor' } } },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'commute_to_work', selector: { entity: { domain: 'sensor' } } },
          { name: 'commute_to_home', selector: { entity: { domain: 'sensor' } } }
        ]
      }
    ];
  }

  _computeLabel(schema) {
    const labels = {
      person_entity: 'Person Entity (Required)',
      name: 'Custom Display Name (Optional)',
      image: 'Custom Avatar Image URL (Optional)',
      home_zone: 'Home Zone Name (Default: home)',
      work_zone: 'Work Zone Name (Default: work)',
      phone_battery: 'Phone Battery % Sensor',
      phone_battery_state: 'Phone Battery State Sensor (Optional)',
      watch_battery: 'Watch Battery % Sensor',
      watch_battery_state: 'Watch Battery State Sensor (Optional)',
      steps_entity: 'Steps Counter Sensor',
      commute_to_work: 'Commute to Work Sensor',
      commute_to_home: 'Commute to Home Sensor'
    };
    return labels[schema.name] || schema.name;
  }
}

// Register Custom Card Editor Component
customElements.define('person-status-card-editor', PersonStatusCardEditor);

// Register Custom Card Metadata in Home Assistant Card Picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'person-status-card',
  name: 'Person Status Card',
  description: 'A custom person card with zone status, animated battery bars, steps, and commute routing.',
  preview: true
});