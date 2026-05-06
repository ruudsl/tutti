import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useMyAssociations, useSwitchAssociation } from '../hooks/useMultiAssociation';
import { Icon } from './Icon';
import { showSuccess, showError } from '../utils/toast';

export function AssociationSwitcher() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { data: associations, isLoading } = useMyAssociations();
    const switchAssociation = useSwitchAssociation();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSwitch = async (associationId: string) => {
        if (associationId === user?.associationId) {
            setIsOpen(false);
            return;
        }

        try {
            const result = await switchAssociation.mutateAsync(associationId);

            // Store the new token
            localStorage.setItem('token', result.token);

            // Update cached user association
            const cachedUser = localStorage.getItem('user');
            if (cachedUser) {
                const userData = JSON.parse(cachedUser);
                userData.associationId = result.associationId;
                userData.associationName = result.associationName;
                localStorage.setItem('user', JSON.stringify(userData));
            }

            showSuccess(t('multiAssociation.switchedSuccess'));
            setIsOpen(false);

            // Full reload to refresh all data with new association context
            window.location.reload();
        } catch {
            showError(t('multiAssociation.switchError'));
        }
    };

    if (isLoading || !associations || associations.length <= 1) {
        return null;
    }

    const currentAssociation = associations.find(a => a.id === user?.associationId);

    return (
        <div className="association-switcher" ref={dropdownRef}>
            <button
                className="association-switcher-trigger"
                onClick={() => setIsOpen(!isOpen)}
                title={t('multiAssociation.switchAssociation')}
            >
                <Icon name="building" size={16} />
                <span className="association-name">
                    {currentAssociation?.displayName || currentAssociation?.name || user?.associationName}
                </span>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={14} />
            </button>

            {isOpen && (
                <div className="association-switcher-dropdown">
                    <div className="dropdown-header">
                        {t('multiAssociation.yourAssociations')}
                    </div>
                    <div className="dropdown-list">
                        {associations.map((assoc) => (
                            <button
                                key={assoc.id}
                                className={`dropdown-item ${assoc.id === user?.associationId ? 'active' : ''}`}
                                onClick={() => handleSwitch(assoc.id)}
                                disabled={switchAssociation.isPending}
                            >
                                <div className="association-info">
                                    <span className="association-display-name">
                                        {assoc.displayName || assoc.name}
                                    </span>
                                    {assoc.myRole && (
                                        <span className="association-role">
                                            {t(`multiAssociation.roles.${assoc.myRole}`)}
                                        </span>
                                    )}
                                </div>
                                {assoc.id === user?.associationId && (
                                    <Icon name="check" size={16} className="check-icon" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
